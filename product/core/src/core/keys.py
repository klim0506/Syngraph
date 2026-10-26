"""Agent keys: the agent sends its key with every call, Syngraph stores only the key's hash."""
import hashlib
import secrets

PREFIX = "sgk_"  # easy to spot in a config or a leak scan
HINT_START = 8  # "sgk_" and 4 random characters
HINT_END = 4


def new_key() -> tuple[str, str, str]:
    """A fresh random key: the key to show once, its hash to store, and a hint like "sgk_Ab3x…9QzT"."""
    key = PREFIX + secrets.token_urlsafe(32)
    # only 4 of the 43 random characters at each end stay visible: far too few to guess the rest
    return key, hash_key(key), f"{key[:HINT_START]}…{key[-HINT_END:]}"


def hash_key(key: str) -> str:
    # The key is 256 random bits, so a plain SHA-256 is enough: there is nothing to guess.
    return hashlib.sha256(key.encode()).hexdigest()
