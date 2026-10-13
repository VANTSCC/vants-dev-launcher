#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// VANTS Desktop — Tauri 2 + Auth0 (PKCE flow nativo)
use oauth2::basic::BasicClient;
use oauth2::{
    AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl,
    Scope, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::webview::PageLoadEvent;
use tauri_plugin_store::StoreExt;
use url::Url;

const AUTH0_DOMAIN: &str = "vants.eu.auth0.com";
const AUTH0_CLIENT_ID: &str = "oaOmNizh7HrASWfmfM29bN284IMJvqPG";
const CALLBACK_PORT: u16 = 1420;
const CALLBACK_PATH: &str = "/callback";
const NEON_DATA_API: &str = "https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1";

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn redirect_uri() -> String {
    format!("http://localhost:{}{}", CALLBACK_PORT, CALLBACK_PATH)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthTokens {
    access_token: String,
    id_token: String,
    refresh_token: Option<String>,
    expires_at: i64,
}

#[derive(Debug, Deserialize)]
struct Auth0TokenResponse {
    access_token: String,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
}

#[derive(Default)]
struct AuthState {
    tokens: Mutex<Option<AuthTokens>>,
    pkce_verifier: Mutex<Option<PkceCodeVerifier>>,
    csrf_token: Mutex<Option<CsrfToken>>,
}

fn build_auth_url() -> (Url, PkceCodeVerifier, CsrfToken) {
    let client = BasicClient::new(
        ClientId::new(AUTH0_CLIENT_ID.to_string()),
        None::<ClientSecret>,
        AuthUrl::new(format!("https://{}/authorize", AUTH0_DOMAIN)).unwrap(),
        Some(TokenUrl::new(format!("https://{}/oauth/token", AUTH0_DOMAIN)).unwrap()),
    )
    .set_redirect_uri(RedirectUrl::new(redirect_uri()).unwrap());

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("offline_access".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();
    (auth_url, pkce_verifier, csrf_token)
}

async fn exchange_code_for_tokens(code: String, verifier: PkceCodeVerifier) -> Result<AuthTokens, String> {
    let params = [
        ("grant_type", "authorization_code".to_string()),
        ("client_id", AUTH0_CLIENT_ID.to_string()),
        ("code", code),
        ("code_verifier", verifier.secret().to_string()),
        ("redirect_uri", redirect_uri()),
    ];
    let res = reqwest::Client::new()
        .post(format!("https://{}/oauth/token", AUTH0_DOMAIN))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed ({}): {}", status, body));
    }
    let t: Auth0TokenResponse = res.json().await.map_err(|e| format!("Invalid token response: {}", e))?;
    Ok(AuthTokens {
        access_token: t.access_token,
        id_token: t.id_token.unwrap_or_default(),
        refresh_token: t.refresh_token,
        expires_at: now_secs() + t.expires_in.unwrap_or(3600),
    })
}

#[tauri::command]
async fn auth0_login(app: AppHandle, state: State<'_, Arc<AuthState>>) -> Result<String, String> {
    let (auth_url, verifier, csrf) = build_auth_url();
    *state.pkce_verifier.lock().unwrap() = Some(verifier);
    *state.csrf_token.lock().unwrap() = Some(csrf);

    if let Err(e) = open::that(auth_url.as_str()) {
        return Err(format!("Failed to open browser: {}", e));
    }

    let app_handle = app.clone();
    let state_clone = state.inner().clone();
    tokio::spawn(async move {
        let server = match tiny_http::Server::http(format!("127.0.0.1:{}", CALLBACK_PORT)) {
            Ok(s) => s,
            Err(e) => {
                let _ = app_handle.emit("auth0-error", format!("Callback server error: {}", e));
                return;
            }
        };
        loop {
            let request = match server.recv() { Ok(r) => r, Err(_) => break };
            if !request.url().starts_with(CALLBACK_PATH) {
                let _ = request.respond(tiny_http::Response::empty(404));
                continue;
            }
            let url = Url::parse(&format!("http://localhost:{}{}", CALLBACK_PORT, request.url())).unwrap();
            let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned());
            let returned_state = url.query_pairs().find(|(k, _)| k == "state").map(|(_, v)| v.into_owned());

            let html = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap();
            let _ = request.respond(
                tiny_http::Response::from_string(
                    "<html><body style='font-family:sans-serif;text-align:center;padding-top:60px'><h2>VANTS</h2><p>Ya puedes cerrar esta ventana y volver a la app.</p></body></html>",
                )
                .with_header(html),
            );

            let expected_state = state_clone.csrf_token.lock().unwrap().take().map(|c| c.secret().to_string());
            if expected_state.is_some() && expected_state != returned_state {
                let _ = app_handle.emit("auth0-error", "Invalid state".to_string());
                break;
            }

            let verifier = state_clone.pkce_verifier.lock().unwrap().take();
            match (code, verifier) {
                (Some(code), Some(verifier)) => match exchange_code_for_tokens(code, verifier).await {
                    Ok(tokens) => {
                        *state_clone.tokens.lock().unwrap() = Some(tokens.clone());
                        if let Ok(store) = app_handle.store("auth.json") {
                            store.set("tokens", serde_json::to_value(&tokens).unwrap());
                            let _ = store.save();
                        }
                        let _ = app_handle.emit("auth0-logged-in", tokens.access_token.clone());
                    }
                    Err(e) => { let _ = app_handle.emit("auth0-error", e); }
                },
                _ => { let _ = app_handle.emit("auth0-error", "Missing authorization code".to_string()); }
            }
            break;
        }
    });
    Ok(auth_url.to_string())
}

#[tauri::command]
async fn auth0_get_token(state: State<'_, Arc<AuthState>>) -> Result<Option<String>, String> {
    Ok(state.tokens.lock().unwrap().clone().map(|t| t.access_token))
}

#[tauri::command]
async fn auth0_logout(app: AppHandle, state: State<'_, Arc<AuthState>>) -> Result<(), String> {
    *state.tokens.lock().unwrap() = None;
    if let Ok(store) = app.store("auth.json") {
        store.clear();
        let _ = store.save();
    }
    Ok(())
}

#[tauri::command]
async fn auth0_restore_session(app: AppHandle, state: State<'_, Arc<AuthState>>) -> Result<Option<String>, String> {
    if let Ok(store) = app.store("auth.json") {
        if let Some(tokens_val) = store.get("tokens") {
            if let Ok(tokens) = serde_json::from_value::<AuthTokens>(tokens_val) {
                if tokens.expires_at > now_secs() {
                    *state.tokens.lock().unwrap() = Some(tokens.clone());
                    return Ok(Some(tokens.access_token));
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
async fn neon_query(
    state: State<'_, Arc<AuthState>>,
    table: String,
    select: Option<String>,
    filters: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let token = state.tokens.lock().unwrap().clone();
    let mut url = Url::parse(&format!("{}/{}", NEON_DATA_API, table)).map_err(|e| e.to_string())?;
    if let Some(sel) = select {
        url.query_pairs_mut().append_pair("select", &sel);
    }
    if let Some(f) = filters {
        for filter in f {
            let parts: Vec<&str> = filter.splitn(3, '.').collect();
            if parts.len() == 3 {
                url.query_pairs_mut().append_pair(parts[0], &format!("{}.{}", parts[1], parts[2]));
            }
        }
    }
    let mut req = reqwest::Client::new().get(url);
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {}", t.access_token));
    }
    let res = req.send().await.map_err(|e| format!("Request failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("API error: {}", res.status()));
    }
    res.json().await.map_err(|e| format!("JSON error: {}", e))
}

// Mantiene el titulo de la ventana como "VANTS" aunque la web cambie document.title
const TITLE_SCRIPT: &str = "(function(){var t='VANTS';var f=function(){if(document.title!==t){document.title=t;}};f();if(!window.__vantsTitle){window.__vantsTitle=true;new MutationObserver(f).observe(document.head||document.documentElement,{childList:true,subtree:true,characterData:true});}})();";

// Avisa a la web de que corre dentro de la app de escritorio (activa el diseño estilo FACEIT)
const DESKTOP_SCRIPT: &str = "(function(){try{localStorage.setItem('vantsDesktop','1');}catch(e){}window.dispatchEvent(new Event('vants-desktop'));})();";

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .build(),
        )
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                log::info!("Pagina cargada: {}", payload.url());
                let _ = webview.window().set_title("VANTS");
                let _ = webview.eval(TITLE_SCRIPT);
                let _ = webview.eval(DESKTOP_SCRIPT);
            }
        })
        .setup(|app| {
            log::info!("VANTS iniciado v{}", app.package_info().version);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .manage(Arc::new(AuthState::default()))
        .invoke_handler(tauri::generate_handler![
            auth0_login,
            auth0_get_token,
            auth0_logout,
            auth0_restore_session,
            neon_query,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
