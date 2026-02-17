"""Allow running as: python -m services.engine.cli"""
from services.engine.cli import main
import sys

if __name__ == "__main__":
    sys.exit(main())
