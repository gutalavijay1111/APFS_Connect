from abc import ABC, abstractmethod
from typing import Dict


class BaseChannel(ABC):
    @abstractmethod
    def send(self, payload: Dict) -> None:
        pass
