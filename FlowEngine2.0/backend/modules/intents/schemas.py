from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from decimal import Decimal


class IntentPolicyBase(BaseModel):
	language_code: str = Field(default='multi', max_length=10)
	tenant_id: str = Field(default='global')
	n8n_orchestration_url: Optional[str] = None
	auto_process_min_conf: Decimal = Field(..., ge=0, le=100)
	manual_review_min_conf: Decimal = Field(..., ge=0, le=100)
	reroute_email: Optional[str] = None
	multi_intent_mode: str = Field(default='STRICT_SINGLE')
	allow_multi_auto: bool = False
	allow_subset_auto: bool = False

	@field_validator('multi_intent_mode')
	@classmethod
	def validate_mode(cls, v):
		allowed = ['STRICT_SINGLE', 'AUTO_ALL', 'AUTO_SUBSET']
		if v not in allowed:
			raise ValueError(f'multi_intent_mode must be one of {allowed}')
		return v


class IntentPolicyCreate(IntentPolicyBase):
	pass


class IntentPolicyUpdate(BaseModel):
    language_code: Optional[str] = Field(None, max_length=10)
    tenant_id: Optional[str] = None
    n8n_orchestration_url: Optional[str] = None
    auto_process_min_conf: Optional[Decimal] = Field(None, ge=0, le=100)
    manual_review_min_conf: Optional[Decimal] = Field(None, ge=0, le=100)
    reroute_email: Optional[str] = None
    multi_intent_mode: Optional[str] = None
    allow_multi_auto: Optional[bool] = None
    allow_subset_auto: Optional[bool] = None

    @field_validator('multi_intent_mode')
    @classmethod
    def validate_mode(cls, v):
        if v is None:
            return v
        allowed = ['STRICT_SINGLE', 'AUTO_ALL', 'AUTO_SUBSET']
        if v not in allowed:
            raise ValueError(f'multi_intent_mode must be one of {allowed}')
        return v


class IntentPolicyOut(IntentPolicyBase):
	intent_id: int
	
	model_config = {"from_attributes": True}


class IntentPolicyWithIntentOut(IntentPolicyBase):
	"""Policy with intent information for display"""
	intent_id: int
	intent_code: str
	intent_display_name: str
	
	model_config = {"from_attributes": True}


class IntentBase(BaseModel):
	intent_code: str = Field(..., min_length=1, max_length=255)
	tenant_id: str = Field(default='global')
	display_name: str = Field(..., min_length=1, max_length=255)
	description: Optional[str] = None
	category: Optional[str] = None
	is_active: bool = True


class IntentCreate(IntentBase):
	policies: Optional[List[IntentPolicyCreate]] = []


class IntentUpdate(BaseModel):
	intent_code: Optional[str] = Field(None, min_length=1, max_length=255)
	tenant_id: Optional[str] = None
	display_name: Optional[str] = Field(None, min_length=1, max_length=255)
	description: Optional[str] = None
	category: Optional[str] = None
	is_active: Optional[bool] = None


class IntentOut(IntentBase):
	intent_id: int
	policies: List[IntentPolicyOut] = []
	
	model_config = {"from_attributes": True}