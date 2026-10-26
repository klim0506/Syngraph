"""Agent keys: the agent sends its key with every call, Syngraph stores only the key's hash."""
import hashlib
import secrets

PREFIX = "sgk_"  # easy to spot in a config or a leak scan
HINT_LENGTH = 4


def new_key() -> tuple[str, str, str]:
    """A fresh random key: (key to show once, hash to store, hint to show later)."""
    key = PREFIX + secrets.token_urlsafe(32)
    return key, hash_key(key), key[-HINT_LENGTH:]


def hash_key(key: str) -> str:
    # The key is 256 random bits, so a plain SHA-256 is enough: there is nothing to guess.
    return hashlib.sha256(key.encode()).hexdigest()
