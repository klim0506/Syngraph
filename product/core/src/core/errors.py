"""Why a call failed. Each cause has its own exception so callers can answer differently."""


class InvalidRequest(Exception):
    """The caller sent bad input: it can fix the request and try again."""


class MandateMisconfigured(Exception):
    """The client's mandate settings are broken: only the client can fix them."""


class BankUnconfirmed(Exception):
    """The bank did not confirm the order. It is not a refusal: the payment may have gone through."""
