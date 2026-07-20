from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime


class ValidationRuleBase(BaseModel):
	"""Base schema for validation rules matching the database schema"""
	intent_id: int = Field(..., description="Foreign key to intents table")
	language_code: str = Field(default='multi', max_length=10, description="Language code, default 'multi'")
	tenant_id: str = Field(default='global', description="Tenant ID for multi-tenancy")
	rule_code: str = Field(..., min_length=1, description="Unique rule code, e.g., SENDER_EMAIL_MATCH")
	rule_name: str = Field(..., min_length=1, description="Human-readable rule name")
	rule_description: str = Field(..., min_length=1, description="Natural language description for LLM")
	datasource_id: int = Field(..., description="Foreign key to datasources table")
	execution_order: int = Field(..., ge=1, description="Order of execution (1, 2, 3, ...)")
	severity: str = Field(default='CRITICAL', description="CRITICAL or WARNING")
	is_active: bool = Field(default=True, description="Whether the rule is active")

	@validator('severity')
	def validate_severity(cls, v):
		"""Ensure severity is either CRITICAL or WARNING"""
		allowed = ['CRITICAL', 'WARNING']
		if v not in allowed:
			raise ValueError(f'severity must be one of {allowed}')
		return v
	
	@validator('language_code')
	def validate_language_code(cls, v):
		"""Validate language code length"""
		if len(v) > 10:
			raise ValueError('language_code must be 10 characters or less')
		return v


class ValidationRuleCreate(ValidationRuleBase):
	"""Schema for creating a new validation rule"""
	pass


class ValidationRuleUpdate(BaseModel):
	"""Schema for updating an existing validation rule - all fields optional"""
	intent_id: Optional[int] = Field(None, description="Foreign key to intents table")
	language_code: Optional[str] = Field(None, max_length=10, description="Language code")
	tenant_id: Optional[str] = Field(None, description="Tenant ID")
	rule_code: Optional[str] = Field(None, min_length=1, description="Unique rule code")
	rule_name: Optional[str] = Field(None, min_length=1, description="Human-readable rule name")
	rule_description: Optional[str] = Field(None, min_length=1, description="Natural language description")
	datasource_id: Optional[int] = Field(None, description="Foreign key to datasources table")
	execution_order: Optional[int] = Field(None, ge=1, description="Order of execution")
	severity: Optional[str] = Field(None, description="CRITICAL or WARNING")
	is_active: Optional[bool] = Field(None, description="Whether the rule is active")

	@validator('severity')
	def validate_severity(cls, v):
		"""Ensure severity is either CRITICAL or WARNING if provided"""
		if v is not None:
			allowed = ['CRITICAL', 'WARNING']
			if v not in allowed:
				raise ValueError(f'severity must be one of {allowed}')
		return v
	
	@validator('language_code')
	def validate_language_code(cls, v):
		"""Validate language code length if provided"""
		if v is not None and len(v) > 10:
			raise ValueError('language_code must be 10 characters or less')
		return v


class DatasourceSimple(BaseModel):
	"""Simplified datasource info for nested responses"""
	datasource_id: int
	name: str
	datasource_type: str
	connection_key: str
	
	class Config:
		from_attributes = True


class ValidationRuleOut(BaseModel):
	"""Schema for validation rule output - matches database structure"""
	rule_id: int
	intent_id: int
	language_code: str
	tenant_id: str
	rule_code: str
	rule_name: str
	rule_description: str
	datasource_id: int
	datasource: DatasourceSimple
	execution_order: int
	severity: str
	is_active: bool
	
	class Config:
		from_attributes = True