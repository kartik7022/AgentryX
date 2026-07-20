# services/eivs/models.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from services.eivs.db import Base


# ----------------------------------------------------------------------
# 1) Config tables: Intent, IntentPolicy, Datasource, ValidationRule
# ----------------------------------------------------------------------


class Intent(Base):
    __tablename__ = "intents"
    __table_args__ = {"schema": "eivs"}

    intent_id = Column(Integer, primary_key=True, autoincrement=True)
    intent_code = Column(Text, nullable=False, unique=True)
    display_name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    tenant_id = Column(Text, nullable=False, default="global")

    intent_policies = relationship(
        "IntentPolicy",
        back_populates="intent",
        cascade="all, delete-orphan",
    )
    validation_rules = relationship(
        "ValidationRule",
        back_populates="intent",
        cascade="all, delete-orphan",
    )


class IntentPolicy(Base):
    __tablename__ = "intent_policies"
    __table_args__ = {"schema": "eivs"}

    intent_id = Column(
        Integer,
        ForeignKey("eivs.intents.intent_id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_code = Column(String(10), primary_key=True, default="multi")

    auto_process_min_conf = Column(Numeric(5, 2), nullable=False)
    manual_review_min_conf = Column(Numeric(5, 2), nullable=False)
    reroute_email = Column(Text, nullable=True)
    multi_intent_mode = Column(Text, nullable=False, default="STRICT_SINGLE")
    allow_multi_auto = Column(Boolean, nullable=False, default=False)
    allow_subset_auto = Column(Boolean, nullable=False, default=False)

    tenant_id = Column(Text, nullable=False, default="global")

    intent = relationship("Intent", back_populates="intent_policies")


class Datasource(Base):
    __tablename__ = "datasources"
    __table_args__ = {"schema": "eivs"}

    datasource_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False, unique=True)
    datasource_type = Column(Text, nullable=False)
    connection_key = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    tenant_id = Column(Text, nullable=False, default="global")

    validation_rules = relationship(
        "ValidationRule",
        back_populates="datasource",
        cascade="all, delete-orphan",
    )


class ValidationRule(Base):
    __tablename__ = "validation_rules"
    __table_args__ = {"schema": "eivs"}

    rule_id = Column(Integer, primary_key=True, autoincrement=True)

    intent_id = Column(
        Integer,
        ForeignKey("eivs.intents.intent_id", ondelete="CASCADE"),
        nullable=False,
    )
    language_code = Column(String(10), nullable=False, default="multi")

    rule_code = Column(Text, nullable=False)
    rule_name = Column(Text, nullable=False)
    rule_description = Column(Text, nullable=False)

    datasource_id = Column(
        Integer,
        ForeignKey("eivs.datasources.datasource_id"),
        nullable=False,
    )
    execution_order = Column(Integer, nullable=False)
    severity = Column(Text, nullable=False, default="CRITICAL")
    is_active = Column(Boolean, nullable=False, default=True)

    tenant_id = Column(Text, nullable=False, default="global")

    intent = relationship("Intent", back_populates="validation_rules")
    datasource = relationship("Datasource", back_populates="validation_rules")


# ----------------------------------------------------------------------
# 2) Runtime tables: EmailIntentRun, ValidationRun, LlmPrompt
# ----------------------------------------------------------------------


class EmailIntentRun(Base):
    __tablename__ = "email_intent_runs"
    __table_args__ = {"schema": "eivs"}

    intent_run_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    tenant_id = Column(Text, nullable=False)
    email_id = Column(Text, nullable=False)
    sender_email = Column(Text, nullable=False)
    correlation_id = Column(String(255), nullable=False)

    language_detected = Column(String(10), nullable=True)
    intents_json = Column(JSONB, nullable=False)
    primary_intent_code = Column(Text, nullable=True)
    primary_intent_conf = Column(Numeric(5, 2), nullable=True)
    coverage_status = Column(Text, nullable=True)

    routing_decision = Column(Text, nullable=False)
    reroute_email = Column(Text, nullable=True)
    routing_reasons_json = Column(JSONB, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )

    llm_prompts = relationship(
        "LlmPrompt",
        back_populates="email_intent_run",
        cascade="all, delete-orphan",
    )
    validation_runs = relationship(
        "ValidationRun",
        back_populates="email_intent_run",
        cascade="all, delete-orphan",
    )


class ValidationRun(Base):
    __tablename__ = "validation_runs"
    __table_args__ = {"schema": "eivs"}

    validation_run_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    intent_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("eivs.email_intent_runs.intent_run_id", ondelete="CASCADE"),
        nullable=False,
    )

    intent_code = Column(Text, nullable=False)
    overall_status = Column(Text, nullable=False)

    validation_success_json = Column(JSONB, nullable=False)
    validation_failure_json = Column(JSONB, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )

    email_intent_run = relationship(
        "EmailIntentRun",
        back_populates="validation_runs",
    )
    llm_prompts = relationship(
        "LlmPrompt",
        back_populates="validation_run",
        cascade="all, delete-orphan",
    )


class LlmPrompt(Base):
    __tablename__ = "llm_prompts"
    __table_args__ = {"schema": "eivs"}

    prompt_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    intent_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("eivs.email_intent_runs.intent_run_id", ondelete="CASCADE"),
        nullable=True,
    )
    validation_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("eivs.validation_runs.validation_run_id", ondelete="CASCADE"),
        nullable=True,
    )

    prompt_type = Column(Text, nullable=False)
    model_name = Column(Text, nullable=False)
    backend = Column(Text, nullable=False)  # PRIMARY | SECONDARY

    request_messages = Column(JSONB, nullable=False)

    request_payload = Column(JSONB, nullable=False)
    response_payload = Column(JSONB, nullable=False)

    tokens_prompt = Column(Integer, nullable=True)
    tokens_completion = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    tenant_id = Column(String, nullable=False)

    email_intent_run = relationship(
        "EmailIntentRun",
        back_populates="llm_prompts",
    )
    validation_run = relationship(
        "ValidationRun",
        back_populates="llm_prompts",
    )