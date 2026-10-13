import os


def require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        raise RuntimeError(f"Falta la variable de entorno {name}")
    return value


def optional_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


def int_env(name: str, *, required: bool = True, default: int | None = None) -> int | None:
    value = os.getenv(name)
    if value is None or value == "":
        if required:
            raise RuntimeError(f"Falta la variable de entorno {name}")
        return default

    try:
        return int(value)
    except ValueError as exc:
        raise RuntimeError(f"La variable de entorno {name} debe ser un entero válido") from exc
