from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class AccountLookupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=256)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=256)


class User(BaseModel):
    id: str
    identifier: str
    display_name: str
    theme: Literal["dark", "light"]
    role: Literal["user", "admin", "super_admin"]
    is_active: bool
    password_set: bool
    created_at: str


class AuthResponse(BaseModel):
    user: User
    access_token: str | None = None
    redirect_to: str


class AdminUserUpdate(BaseModel):
    role: Literal["user", "admin"] | None = None
    is_active: bool | None = None


class AdminCreateRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=120)
    display_name: str | None = Field(default=None, max_length=120)
    temporary_password: str = Field(min_length=8, max_length=256)


class SystemSettingUpdate(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    value: str = Field(max_length=2000)


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=80)


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class Conversation(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str
    last_message: str | None = None


class Message(BaseModel):
    id: str
    conversation_id: str
    user_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(validation_alias=AliasChoices("userId", "user_id"))
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("conversationId", "conversation_id"),
    )


class ChatResponse(BaseModel):
    reply: str
    conversation: Conversation
    messages: list[Message]
    assistant_message: Message
