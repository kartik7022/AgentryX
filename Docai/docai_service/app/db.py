from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Generator
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, create_engine, func
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

try:
    from pgvector.sqlalchemy import Vector
except ImportError:  # pragma: no cover - keeps imports working before dependency install
    from sqlalchemy.types import TypeDecorator

    class Vector(TypeDecorator):
        impl = Text
        cache_ok = True

        def __init__(self, dimensions: int):
            super().__init__()
            self.dimensions = dimensions

        def process_bind_param(self, value, dialect):
            if value is None:
                return None
            return json.dumps(list(value))

        def process_result_value(self, value, dialect):
            if value is None:
                return None
            if isinstance(value, list):
                return value
            try:
                return json.loads(value)
            except Exception:
                return value


POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_USER = os.getenv("POSTGRES_USER", "docai_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "docai_pass")
POSTGRES_DB = os.getenv("POSTGRES_DB", "docai_db")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
USE_SQLITE = os.getenv("DOCAI_USE_SQLITE", "false").lower() == "true" or POSTGRES_HOST.lower() == "sqlite"

if USE_SQLITE:
    sqlite_path = Path(__file__).resolve().parents[1] / "docai_local.db"
    DATABASE_URL = f"sqlite:///{sqlite_path}"
else:
    DATABASE_URL = (
        f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
        f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )

engine_kwargs = {"pool_pre_ping": True}
if USE_SQLITE:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class DocumentType(Base):
    __tablename__ = "document_types"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    doc_type_name = Column(String(255), unique=True, nullable=False)
    schema_definition = Column(JSON)
    confidence_threshold = Column(Float, default=0.80)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    templates = relationship("Template", back_populates="document_type")
    model_registry_entries = relationship("ModelRegistryEntry", back_populates="document_type")
    parsing_rules = relationship("ParsingRule", back_populates="document_type", cascade="all, delete-orphan")
    field_mappings = relationship("FieldMapping", back_populates="document_type", cascade="all, delete-orphan")


class Template(Base):
    __tablename__ = "templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    doc_id = Column(String(255))
    doc_type_id = Column(String(36), ForeignKey("document_types.id"))
    sample_text = Column(Text)
    embedding = Column(Vector(384))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document_type = relationship("DocumentType", back_populates="templates")


class ModelRegistryEntry(Base):
    __tablename__ = "model_registry_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    doc_type_id = Column(String(36), ForeignKey("document_types.id"))
    doc_id = Column(String(255), unique=True)
    mlflow_run_id = Column(String(255))
    mlflow_model_uri = Column(Text)
    model_type = Column(String(100), default="LayoutLMv3")
    status = Column(String(50), default="registered")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document_type = relationship("DocumentType", back_populates="model_registry_entries")


class ParsingRule(Base):
    __tablename__ = "parsing_rules"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    doc_type_id = Column(String(36), ForeignKey("document_types.id"), nullable=False)
    field_name = Column(String(255), nullable=False)
    match_type = Column(String(50), default="regex")
    pattern = Column(Text, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    document_type = relationship("DocumentType", back_populates="parsing_rules")
    versions = relationship("ParsingRuleVersion", back_populates="parsing_rule", cascade="all, delete-orphan")


class ParsingRuleVersion(Base):
    __tablename__ = "parsing_rule_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    parsing_rule_id = Column(String(36), ForeignKey("parsing_rules.id"), nullable=False)
    version_number = Column(Integer, default=1)
    field_name = Column(String(255), nullable=False)
    match_type = Column(String(50), default="regex")
    pattern = Column(Text, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    parsing_rule = relationship("ParsingRule", back_populates="versions")


class FieldMapping(Base):
    __tablename__ = "field_mappings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    doc_type_id = Column(String(36), ForeignKey("document_types.id"), nullable=False)
    source_field = Column(String(255), nullable=False)
    target_field = Column(String(255), nullable=False)
    transform = Column(String(50), default="copy")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    document_type = relationship("DocumentType", back_populates="field_mappings")


class ParseRequest(Base):
    __tablename__ = "parse_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    doc_id = Column(String(255))
    file_name = Column(String(500))
    parser_used = Column(String(100))
    confidence_score = Column(Float)
    extracted_fields = Column(JSON)
    pii_redacted = Column(Boolean, default=False)
    status = Column(String(50), default="pending")
    user_id = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    audit_logs = relationship("AuditLog", back_populates="parse_request")
    corrections = relationship("ParseCorrection", back_populates="parse_request")


class ParseCorrection(Base):
    __tablename__ = "parse_corrections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    parse_request_id = Column(String(36), ForeignKey("parse_requests.id"), nullable=False)
    doc_id = Column(String(255))
    original_fields = Column(JSON)
    corrected_fields = Column(JSON)
    reviewer_id = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parse_request = relationship("ParseRequest", back_populates="corrections")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_type = Column(String(100))
    doc_id = Column(String(255))
    parse_request_id = Column(String(36), ForeignKey("parse_requests.id"), nullable=True)
    user_id = Column(String(255))
    status = Column(String(100))
    details = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parse_request = relationship("ParseRequest", back_populates="audit_logs")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(Text, nullable=False)
    role = Column(String(50), default="viewer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if USE_SQLITE:
    Base.metadata.create_all(bind=engine)
