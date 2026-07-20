from pydantic import BaseModel
from typing import Optional


class SuccessResponse(BaseModel):
    message: str
    detail: Optional[str] = None