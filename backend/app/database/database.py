from sqlalchemy import create_engine

from sqlalchemy.ext.declarative import (
    declarative_base
)

from sqlalchemy.orm import sessionmaker


# =====================================
# DATABASE URL
# =====================================

DATABASE_URL = (
    "sqlite:///./inventory.db"
)


# =====================================
# DATABASE ENGINE
# =====================================

engine = create_engine(

    DATABASE_URL,

    connect_args={
        "check_same_thread": False
    }
)


# =====================================
# SESSION
# =====================================

SessionLocal = sessionmaker(

    autocommit=False,

    autoflush=False,

    bind=engine
)


# =====================================
# BASE MODEL
# =====================================

Base = declarative_base()


# =====================================
# DB SESSION DEPENDENCY
# =====================================

def get_db():

    db = SessionLocal()

    try:

        yield db

    finally:

        db.close()