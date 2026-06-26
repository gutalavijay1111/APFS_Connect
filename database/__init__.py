import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from contextlib import contextmanager
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base

load_dotenv()

DATABASE_USERNAME = os.getenv("DATABASE_USERNAME", "")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD", "")
DATABASE_HOST = os.getenv("DATABASE_HOST", "")
DATABASE_PORT = os.getenv("DATABASE_PORT", "5432")
DATABASE_NAME = os.getenv("DATABASE_NAME", "")

if not all([DATABASE_USERNAME, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_NAME]):
    print("Missing database configurations")
    exit()

DATABASE_URL = f"postgresql://{DATABASE_USERNAME}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}"

engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()