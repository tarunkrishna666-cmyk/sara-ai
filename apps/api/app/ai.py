from .services.chat_service import RoutedChatService


async def generate_sara_response(
    message: str, history: list[dict[str, str]] | None = None
) -> str:
    service = RoutedChatService()
    try:
        return await service.generate_reply(message, history or [])
    finally:
        await service.close()
