"""Validated page-relative geometry for document region annotations."""
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RegionGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    x: float = Field(ge=0, lt=1)
    y: float = Field(ge=0, lt=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def stay_within_page(self):
        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError("region must stay inside the page")
        return self
