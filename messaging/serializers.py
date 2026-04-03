from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
import re
from rest_framework import serializers

from .models import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    Message,
    MessageEditHistory,
    MessagePoll,
    MessagePollOption,
    MessagePollVote,
    MessageReaction,
    MessageReceipt,
    MessageStatus,
    TypingIndicator,
)

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "is_online", "last_seen"]


class ConversationSerializer(serializers.ModelSerializer):
    participants = UserBriefSerializer(many=True, read_only=True)
    is_pinned = serializers.SerializerMethodField()
    pinned_at = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()
    hidden_at = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = Conversation
        fields = [
            "id",
            "conversation_type",
            "name",
            "participants",
            "participant_ids",
            "created_by",
            "created_at",
            "updated_at",
            "is_pinned",
            "pinned_at",
            "is_hidden",
            "hidden_at",
            "is_locked",
            "encrypted",
            "is_active",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at", "encrypted"]

    def get_is_pinned(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        participant = obj.participant_entries.filter(user=request.user).first()
        return bool(participant and participant.is_pinned)

    def get_pinned_at(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        participant = obj.participant_entries.filter(user=request.user).first()
        return participant.pinned_at if participant else None

    def get_is_hidden(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        participant = obj.participant_entries.filter(user=request.user).first()
        return bool(participant and participant.is_hidden)

    def get_hidden_at(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        participant = obj.participant_entries.filter(user=request.user).first()
        return participant.hidden_at if participant else None

    def get_is_locked(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        participant = obj.participant_entries.filter(user=request.user).first()
        return bool(participant and participant.is_locked)

    def validate(self, attrs):
        request = self.context["request"]
        participant_ids = attrs.get("participant_ids")
        conversation_type = attrs.get(
            "conversation_type",
            self.instance.conversation_type if self.instance else ConversationType.DIRECT,
        )

        # Allow metadata-only updates (e.g., renaming a group) without forcing
        # participant validation rules used during conversation creation.
        if self.instance is not None and participant_ids is None:
            return attrs

        if participant_ids is None:
            participant_ids = []

        # Always include current user.
        all_ids = set(participant_ids)
        all_ids.add(request.user.id)

        users = list(User.objects.filter(id__in=all_ids))
        if len(users) != len(all_ids):
            raise serializers.ValidationError("One or more participants do not exist.")

        if conversation_type == ConversationType.DIRECT and len(all_ids) != 2:
            raise serializers.ValidationError(
                "Direct conversations must have exactly 2 participants."
            )

        attrs["participant_users"] = users
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        users = validated_data.pop("participant_users")
        validated_data.pop("participant_ids", None)
        request = self.context["request"]

        # Reuse existing direct conversation for same two users.
        if validated_data.get("conversation_type") == ConversationType.DIRECT:
            user_ids = sorted([u.id for u in users])
            existing = (
                Conversation.objects.filter(conversation_type=ConversationType.DIRECT)
                .filter(participant_entries__user_id=user_ids[0], participant_entries__is_active=True)
                .filter(participant_entries__user_id=user_ids[1], participant_entries__is_active=True)
                .distinct()
                .first()
            )
            if existing:
                return existing

        conversation = Conversation.objects.create(created_by=request.user, **validated_data)
        for user in users:
            ConversationParticipant.objects.create(
                conversation=conversation,
                user=user,
                is_admin=(user.id == request.user.id),
                is_active=True,
            )
        return conversation


class MessageReceiptSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)

    class Meta:
        model = MessageReceipt
        fields = ["user", "status", "delivered_at", "read_at"]


class MessageEditHistorySerializer(serializers.ModelSerializer):
    edited_by = UserBriefSerializer(read_only=True)

    class Meta:
        model = MessageEditHistory
        fields = ["edited_by", "previous_content", "edited_at"]


class MentionSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class MessagePollVoteSerializer(serializers.Serializer):
    option_id = serializers.IntegerField()
    text = serializers.CharField()
    votes = serializers.IntegerField()
    voted = serializers.BooleanField()


class MessagePollSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    question = serializers.CharField()
    allows_multiple = serializers.BooleanField()
    closes_at = serializers.DateTimeField(allow_null=True)
    options = MessagePollVoteSerializer(many=True)


EVENT_DATETIME_RE = re.compile(
    r"\b(?P<date>\d{4}-\d{2}-\d{2})\s+(?P<time>\d{2}:\d{2})(?:\s*[-to]+\s*(?P<end>\d{2}:\d{2}))?\b"
)
MENTION_RE = re.compile(r"(?<!\w)@(?P<username>[A-Za-z0-9_.-]{2,150})")


class MessageSerializer(serializers.ModelSerializer):
    sender = UserBriefSerializer(read_only=True)
    receipts = MessageReceiptSerializer(many=True, read_only=True)
    mentions = MentionSerializer(many=True, source="mentioned_users", read_only=True)
    edit_history = MessageEditHistorySerializer(many=True, read_only=True)
    poll = serializers.SerializerMethodField()
    event_suggestion = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    receiver = serializers.SerializerMethodField()
    expiration_hours = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "receiver",
            "content",
            "sent_at",
            "edited_at",
            "is_edited",
            "expires_at",
            "is_expired",
            "is_pinned",
            "encrypted",
            "receipts",
            "mentions",
            "edit_history",
            "poll",
            "event_suggestion",
            "reactions",
            "expiration_hours",
        ]
        read_only_fields = [
            "id",
            "sender",
            "receiver",
            "sent_at",
            "edited_at",
            "is_edited",
            "is_expired",
            "encrypted",
            "receipts",
            "mentions",
            "edit_history",
            "poll",
            "event_suggestion",
            "reactions",
        ]

    def get_poll(self, obj):
        if not hasattr(obj, "poll"):
            return None

        request = self.context.get("request")
        current_user_id = request.user.id if request and request.user.is_authenticated else None
        poll = obj.poll
        options = []
        for option in poll.options.all():
            option_votes = option.votes.all()
            options.append(
                {
                    "option_id": option.id,
                    "text": option.text,
                    "votes": option_votes.count(),
                    "voted": bool(current_user_id and option_votes.filter(user_id=current_user_id).exists()),
                }
            )

        return {
            "id": poll.id,
            "question": poll.question,
            "allows_multiple": poll.allows_multiple,
            "closes_at": poll.closes_at,
            "options": options,
        }

    def get_event_suggestion(self, obj):
        content = (obj.content or "").strip()
        match = EVENT_DATETIME_RE.search(content)
        if not match:
            return None

        try:
            start = timezone.datetime.fromisoformat(
                f"{match.group('date')}T{match.group('time')}:00"
            )
            if timezone.is_naive(start):
                start = timezone.make_aware(start, timezone.get_current_timezone())

            if match.group("end"):
                end = timezone.datetime.fromisoformat(
                    f"{match.group('date')}T{match.group('end')}:00"
                )
                if timezone.is_naive(end):
                    end = timezone.make_aware(end, timezone.get_current_timezone())
            else:
                end = start + timedelta(hours=1)
        except ValueError:
            return None

        title = content.split("\n", 1)[0][:80] or "Chat event"
        return {
            "title": title,
            "start_at": start,
            "end_at": end,
            "timezone": str(timezone.get_current_timezone()),
        }

    def get_reactions(self, obj):
        request = self.context.get("request")
        current_user_id = request.user.id if request and request.user.is_authenticated else None

        grouped = {}
        for reaction in obj.reactions.select_related("user").all():
            entry = grouped.setdefault(
                reaction.emoji,
                {
                    "emoji": reaction.emoji,
                    "count": 0,
                    "reacted": False,
                },
            )
            entry["count"] += 1
            if current_user_id and reaction.user_id == current_user_id:
                entry["reacted"] = True

        return list(grouped.values())

    def get_receiver(self, obj):
        if obj.conversation.conversation_type != ConversationType.DIRECT:
            return None
        other = obj.conversation.get_other_participant(obj.sender)
        if not other:
            return None
        return {"id": other.id, "username": other.username}

    def validate(self, attrs):
        request = self.context["request"]
        conversation = attrs.get("conversation")

        if conversation and not conversation.participant_entries.filter(
            user_id=request.user.id,
            is_active=True,
        ).exists():
            raise serializers.ValidationError("You are not an active participant in this conversation.")

        if not attrs.get("content", "").strip():
            raise serializers.ValidationError("Message content cannot be empty.")

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        expiration_hours = validated_data.pop("expiration_hours", None)
        request = self.context["request"]

        message = Message.objects.create(sender=request.user, **validated_data)

        mention_usernames = {
            mention.group("username") for mention in MENTION_RE.finditer(message.content or "")
        }
        if mention_usernames:
            mention_users = User.objects.filter(
                username__in=mention_usernames,
                conversations=message.conversation,
            ).distinct()
            message.mentioned_users.add(*mention_users)

        if expiration_hours is None:
            user_settings = getattr(request.user, "settings", None)
            expiration_hours = (
                user_settings.default_message_expiration_hours if user_settings else 24
            )

        message.expires_at = timezone.now() + timedelta(hours=expiration_hours)
        message.save(update_fields=["expires_at"])

        recipients = message.conversation.participants.exclude(id=request.user.id)
        for recipient in recipients:
            MessageReceipt.objects.create(
                message=message,
                user=recipient,
                status=MessageStatus.SENT,
            )

        return message


class TypingIndicatorSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)

    class Meta:
        model = TypingIndicator
        fields = ["conversation", "user", "is_typing", "updated_at"]
