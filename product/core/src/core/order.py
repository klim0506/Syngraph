"""Payment-order fields supplied by an agent, separate from the account used to debit."""
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

AccountNumber = Annotated[str, StringConstraints(pattern=r"^[0-9]{20}$")]
Bic = Annotated[str, StringConstraints(pattern=r"^[0-9]{9}$")]
Kpp = Annotated[str, StringConstraints(pattern=r"^(?:0|[0-9]{4}[0-9A-Z]{2}[0-9]{3})$")]
Inn = Annotated[str, StringConstraints(pattern=r"^(?:[0-9]{10}|[0-9]{12})$")]
ShortCode = Annotated[str, StringConstraints(min_length=1, max_length=2)]
VO_PREFIX = re.compile(r"^\{VO([0-9]{5})\}")


class Vat(BaseModel):
    """VAT on a payment. The top-level payment amount is the total including VAT."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["ONTOP", "INCLUDED", "MANUAL", "NO_VAT"]
    rate: str | None = Field(default=None, pattern=r"^(?:[0-9]{1,2}(?:\.[0-9]{1,2})?|100)$")
    amount: str | None = Field(default=None, pattern=r"^[0-9]{1,14}(?:\.[0-9]{1,2})?$", description="VAT in rubles")

    @model_validator(mode="after")
    def validate_amount(self) -> Self:
        if self.type in ("ONTOP", "INCLUDED") and (self.rate is None or self.amount is None):
            raise ValueError("VAT rate and amount are required for ONTOP and INCLUDED")
        if self.type == "NO_VAT" and (Decimal(self.rate or "0") or Decimal(self.amount or "0")):
            raise ValueError("VAT rate and amount must be zero for NO_VAT")
        return self


class BudgetDetails(BaseModel):
    """Budget and tax payment details (fields 101 and 104–110, and UIP/UIN)."""

    model_config = ConfigDict(extra="forbid")

    drawer_status: str | None = Field(default=None, pattern=r"^(?:0|[0-9]{2})$", description="Field 101")
    kbk: str | None = Field(default=None, pattern=r"^(?:0|[0-9]{20})$", description="Field 104")
    oktmo: str | None = Field(default=None, pattern=r"^(?:0|[0-9]{8}|[0-9]{11})$", description="Field 105")
    reason_code: ShortCode | None = Field(default=None, description="Field 106")
    tax_period: str | None = Field(default=None, min_length=1, max_length=10, description="Field 107")
    document_number: str | None = Field(default=None, min_length=1, max_length=20, description="Field 108")
    document_date: str | None = Field(default=None, min_length=1, max_length=10, description="Field 109")
    payment_kind: ShortCode | None = Field(default=None, description="Field 110")
    uip: str | None = Field(default=None, pattern=r"^(?:0|[0-9]{20}|[0-9]{25})$", description="UIP or UIN")


class PaymentOrder(BaseModel):
    """Additional fields of a ruble payment order. Identifiers retain their leading zeros."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    payee_account: AccountNumber
    payee_bank_bic: Bic
    payee_bank_corr_account: AccountNumber | None = None
    payee_kpp: Kpp | None = None
    payer_account: AccountNumber | None = Field(default=None, description="Document detail for the demo account")
    payer_bank_bic: Bic | None = None
    payer_bank_corr_account: AccountNumber | None = None
    payer_kpp: Kpp | None = None
    payer_inn: Inn | None = None
    payer_name: str | None = Field(default=None, min_length=1, max_length=160)
    document_number: str | None = Field(default=None, pattern=r"^[0-9]{1,6}$")
    document_date: date | None = None
    priority: int | None = Field(default=None, strict=True, ge=1, le=5)
    purpose: str = Field(min_length=1, max_length=210, description="Invoice or contract reference and VAT details")
    vat: Vat | None = Field(default=None, description="Omit for no VAT. Send null for multiple rates in purpose.")
    budget: BudgetDetails | None = None
    vo_code: str | None = Field(default=None, pattern=r"^[0-9]{5}$", description="Currency operation code for a nonresident")

    @model_validator(mode="after")
    def normalize_purpose(self) -> Self:
        prefix = VO_PREFIX.match(self.purpose)
        if prefix:
            if prefix[1] != self.vo_code or not self.purpose[prefix.end():].strip():
                raise ValueError("purpose must contain payment details and its VO prefix must match vo_code")
            self.purpose = f"{prefix[0]} {self.purpose[prefix.end():].strip()}"
        elif self.vo_code:
            self.purpose = f"{{VO{self.vo_code}}} {self.purpose}"
        if len(self.purpose) > 210:
            raise ValueError("purpose must be at most 210 characters including the VO prefix")
        return self
