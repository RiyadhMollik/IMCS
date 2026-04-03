from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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
from .serializers import ConversationSerializer, MessageSerializer, TypingIndicatorSerializer


def to_bool(value, default=True):
	if value is None:
		return default
	if isinstance(value, bool):
		return value
	if isinstance(value, str):
		value = value.strip().lower()
		if value in {"true", "1", "yes", "on"}:
			return True
		if value in {"false", "0", "no", "off"}:
			return False
	return bool(value)


class ConversationViewSet(viewsets.ModelViewSet):
	serializer_class = ConversationSerializer
	permission_classes = [IsAuthenticated]

	def get_queryset(self):
		queryset = (
			Conversation.objects.filter(
				participant_entries__user=self.request.user,
				participant_entries__is_active=True,
				is_active=True,
			)
			.prefetch_related("participants")
			.prefetch_related("participant_entries")
			.distinct()
			.order_by("-participant_entries__is_pinned", "-participant_entries__pinned_at", "-updated_at")
		)

		# Hidden conversations should only be excluded from listing; detail actions
		# such as hide/unhide/lock must still resolve hidden conversations.
		include_hidden = self.request.query_params.get("include_hidden") in ["1", "true", "True"]
		if self.action == "list" and not include_hidden:
			queryset = queryset.filter(participant_entries__is_hidden=False)

		return queryset

	@action(detail=False, methods=["get"])
	def direct_with(self, request):
		other_user_id = request.query_params.get("user_id")
		if not other_user_id:
			return Response({"error": "user_id is required."}, status=400)

		conversation = (
			Conversation.objects.filter(conversation_type=ConversationType.DIRECT)
			.filter(participant_entries__user=request.user, participant_entries__is_active=True)
			.filter(participant_entries__user_id=other_user_id, participant_entries__is_active=True)
			.distinct()
			.first()
		)

		if not conversation:
			return Response({"conversation": None})

		return Response(ConversationSerializer(conversation, context={"request": request}).data)

	@action(detail=True, methods=["post"])
	def pin(self, request, pk=None):
		conversation = self.get_object()
		is_pinned = to_bool(request.data.get("is_pinned"), default=True)
		participant = get_object_or_404(
			ConversationParticipant,
			conversation=conversation,
			user=request.user,
			is_active=True,
		)
		participant.is_pinned = is_pinned
		participant.pinned_at = None
		if is_pinned:
			from django.utils import timezone
			participant.pinned_at = timezone.now()
		participant.save(update_fields=["is_pinned", "pinned_at"])
		return Response({"status": "pinned" if is_pinned else "unpinned"})

	@action(detail=True, methods=["post"])
	def hide(self, request, pk=None):
		conversation = self.get_object()
		is_hidden = to_bool(request.data.get("is_hidden"), default=True)
		participant = get_object_or_404(
			ConversationParticipant,
			conversation=conversation,
			user=request.user,
			is_active=True,
		)
		participant.is_hidden = is_hidden
		participant.hidden_at = None
		if is_hidden:
			from django.utils import timezone
			participant.hidden_at = timezone.now()
		participant.save(update_fields=["is_hidden", "hidden_at"])
		return Response({"status": "hidden" if is_hidden else "unhidden"})

	@action(detail=True, methods=["post"])
	def lock(self, request, pk=None):
		conversation = self.get_object()
		is_locked = to_bool(request.data.get("is_locked"), default=True)
		participant = get_object_or_404(
			ConversationParticipant,
			conversation=conversation,
			user=request.user,
			is_active=True,
		)
		participant.is_locked = is_locked
		participant.locked_at = None
		if is_locked:
			from django.utils import timezone
			participant.locked_at = timezone.now()
		participant.save(update_fields=["is_locked", "locked_at"])
		return Response({"status": "locked" if is_locked else "unlocked"})

	@action(detail=True, methods=["post"])
	def add_participant(self, request, pk=None):
		conversation = self.get_object()
		if conversation.conversation_type != ConversationType.GROUP:
			return Response(
				{"error": "Only group conversations support adding participants."},
				status=400,
			)

		user_id = request.data.get("user_id")
		if not user_id:
			return Response({"error": "user_id is required."}, status=400)

		participant, _ = ConversationParticipant.objects.get_or_create(
			conversation=conversation,
			user_id=user_id,
			defaults={"is_active": True},
		)
		if not participant.is_active:
			participant.is_active = True
			participant.left_at = None
			participant.save(update_fields=["is_active", "left_at"])

		return Response({"status": "participant_added"})

	@action(detail=True, methods=["post"])
	def remove_participant(self, request, pk=None):
		conversation = self.get_object()
		if conversation.conversation_type != ConversationType.GROUP:
			return Response(
				{"error": "Only group conversations support removing participants."},
				status=400,
			)

		user_id = request.data.get("user_id")
		if not user_id:
			return Response({"error": "user_id is required."}, status=400)

		entry = get_object_or_404(
			ConversationParticipant, conversation=conversation, user_id=user_id
		)
		entry.is_active = False
		entry.save(update_fields=["is_active"])
		return Response({"status": "participant_removed"})


class MessageViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
	serializer_class = MessageSerializer
	permission_classes = [IsAuthenticated]

	def get_queryset(self):
		user = self.request.user
		queryset = Message.objects.filter(
			conversation__participant_entries__user=user,
			conversation__participant_entries__is_active=True,
		).select_related("sender", "conversation").prefetch_related(
			"reactions", "reactions__user", "receipts", "receipts__user", "mentioned_users", "edit_history", "poll__options", "poll__options__votes"
		)

		other_user = self.request.query_params.get("other_user")
		conversation_id = self.request.query_params.get("conversation")
		query = self.request.query_params.get("q")
		only_pinned = self.request.query_params.get("pinned")
		has_poll = self.request.query_params.get("has_poll")
		sender_id = self.request.query_params.get("sender")
		mentioned_only = self.request.query_params.get("mentioned")

		if other_user:
			queryset = queryset.filter(
				conversation__conversation_type=ConversationType.DIRECT,
				conversation__participants__id=other_user,
			)

		if conversation_id:
			queryset = queryset.filter(conversation_id=conversation_id)

		if query:
			queryset = queryset.filter(
				Q(content__icontains=query) |
				Q(sender__username__icontains=query)
			)

		if only_pinned in ["1", "true", "True"]:
			queryset = queryset.filter(is_pinned=True)

		if has_poll in ["1", "true", "True"]:
			queryset = queryset.filter(poll__isnull=False)

		if sender_id:
			queryset = queryset.filter(sender_id=sender_id)

		if mentioned_only in ["1", "true", "True"]:
			queryset = queryset.filter(
				Q(mentioned_users=user) |
				Q(content__icontains='@')
			).distinct()

		return queryset.order_by("sent_at")

	@transaction.atomic
	def create(self, request, *args, **kwargs):
		data = request.data.copy()

		# Compatibility mode for existing frontend: POST /messages/ with receiver + content.
		receiver_id = data.get("receiver")
		conversation_id = data.get("conversation")
		if conversation_id:
			is_active_member = ConversationParticipant.objects.filter(
				conversation_id=conversation_id,
				user=request.user,
				is_active=True,
			).exists()
			if not is_active_member:
				return Response(
					{"error": "You are no longer an active participant in this conversation."},
					status=status.HTTP_403_FORBIDDEN,
				)
		if not conversation_id and receiver_id:
			existing = (
				Conversation.objects.filter(conversation_type=ConversationType.DIRECT)
				.filter(participants=request.user)
				.filter(participants__id=receiver_id)
				.distinct()
				.first()
			)
			if existing:
				data["conversation"] = existing.id
			else:
				conversation = Conversation.objects.create(
					conversation_type=ConversationType.DIRECT,
					created_by=request.user,
					encrypted=True,
				)
				ConversationParticipant.objects.create(
					conversation=conversation, user=request.user, is_admin=True
				)
				ConversationParticipant.objects.create(
					conversation=conversation, user_id=receiver_id, is_admin=False
				)
				data["conversation"] = conversation.id

		serializer = self.get_serializer(data=data)
		serializer.is_valid(raise_exception=True)
		message = serializer.save()

		# Push direct messages to websocket room so API-created messages (e.g. file share)
		# are delivered in realtime to connected clients.
		conversation = message.conversation
		if conversation.conversation_type == ConversationType.DIRECT:
			participant_ids = list(
				conversation.participants.values_list("id", flat=True).order_by("id")
			)
			if len(participant_ids) == 2:
				room_name = f"dm_{participant_ids[0]}_{participant_ids[1]}"
				other_user_id = (
					participant_ids[1]
					if participant_ids[0] == request.user.id
					else participant_ids[0]
				)

				channel_layer = get_channel_layer()
				async_to_sync(channel_layer.group_send)(
					room_name,
					{
						"type": "direct_message",
						"message_id": message.id,
						"sender_id": request.user.id,
						"sender_username": request.user.username,
						"receiver_id": other_user_id,
						"content": message.content,
						"created_at": message.sent_at.isoformat(),
					},
				)
		elif conversation.conversation_type == ConversationType.GROUP:
			channel_layer = get_channel_layer()
			async_to_sync(channel_layer.group_send)(
				f"group_{conversation.id}",
				{
					"type": "group_message",
					"message_id": message.id,
					"sender_id": request.user.id,
					"sender_username": request.user.username,
					"group_id": conversation.id,
					"content": message.content,
					"created_at": message.sent_at.isoformat(),
				},
			)

		output = self.get_serializer(message)
		headers = self.get_success_headers(output.data)
		return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

	@action(detail=True, methods=["post"])
	def mark_read(self, request, pk=None):
		message = self.get_object()
		receipt, _ = MessageReceipt.objects.get_or_create(message=message, user=request.user)
		receipt.status = MessageStatus.READ
		receipt.mark_read()
		self._broadcast_receipt_update(message, request.user.id, receipt)
		return Response({"status": "read", "read_at": receipt.read_at})

	@action(detail=True, methods=["post"])
	def mark_delivered(self, request, pk=None):
		message = self.get_object()
		receipt, _ = MessageReceipt.objects.get_or_create(message=message, user=request.user)
		if receipt.status == MessageStatus.SENT:
			receipt.mark_delivered()
		self._broadcast_receipt_update(message, request.user.id, receipt)
		return Response({"status": receipt.status, "delivered_at": receipt.delivered_at})

	@action(detail=True, methods=["post"])
	def edit(self, request, pk=None):
		message = self.get_object()
		new_content = (request.data.get("content") or "").strip()
		if not new_content:
			return Response({"error": "content is required."}, status=400)
		if message.sender_id != request.user.id:
			return Response({"error": "Only sender can edit message."}, status=403)
		if message.is_deleted:
			return Response({"error": "Cannot edit deleted message."}, status=400)
		if message.content == new_content:
			return Response(self.get_serializer(message).data)

		MessageEditHistory.objects.create(
			message=message,
			edited_by=request.user,
			previous_content=message.content,
		)

		message.content = new_content
		from django.utils import timezone
		message.edited_at = timezone.now()
		message.is_edited = True
		message.save(update_fields=["content", "edited_at", "is_edited"])

		message.mentioned_users.clear()
		from .serializers import MENTION_RE
		mentions = {m.group("username") for m in MENTION_RE.finditer(new_content)}
		if mentions:
			mentioned_users = message.conversation.participants.filter(username__in=mentions)
			message.mentioned_users.add(*mentioned_users)

		self._broadcast_message_update(message, request.user.id, "edited")
		return Response(self.get_serializer(message).data)

	@action(detail=True, methods=["get"])
	def history(self, request, pk=None):
		message = self.get_object()
		if message.sender_id != request.user.id and message.conversation.conversation_type == ConversationType.DIRECT:
			return Response({"error": "Not authorized."}, status=403)
		return Response(self.get_serializer(message).data.get("edit_history", []))

	@action(detail=True, methods=["post"])
	def pin(self, request, pk=None):
		message = self.get_object()
		is_pinned = bool(request.data.get("is_pinned", True))
		if is_pinned and message.conversation.conversation_type != ConversationType.GROUP:
			return Response({"error": "Pinned messages are supported in groups only."}, status=400)
		message.is_pinned = is_pinned
		message.save(update_fields=["is_pinned"])
		self._broadcast_message_update(message, request.user.id, "pinned" if is_pinned else "unpinned")
		return Response({"status": "pinned" if is_pinned else "unpinned"})

	@action(detail=False, methods=["post"])
	@transaction.atomic
	def create_poll(self, request):
		conversation_id = request.data.get("conversation")
		question = (request.data.get("question") or "").strip()
		options = request.data.get("options") or []
		allows_multiple = bool(request.data.get("allows_multiple", False))

		if not conversation_id:
			return Response({"error": "conversation is required."}, status=400)
		if not question:
			return Response({"error": "question is required."}, status=400)
		if not isinstance(options, list) or len(options) < 2:
			return Response({"error": "At least 2 options are required."}, status=400)

		conversation = get_object_or_404(
			Conversation,
			id=conversation_id,
			participant_entries__user=request.user,
			participant_entries__is_active=True,
		)

		message = Message.objects.create(
			conversation=conversation,
			sender=request.user,
			content=f"[POLL]{question}",
			encrypted=True,
		)

		poll = MessagePoll.objects.create(
			message=message,
			question=question,
			allows_multiple=allows_multiple,
		)
		for option_text in options:
			trimmed = str(option_text).strip()
			if trimmed:
				MessagePollOption.objects.create(poll=poll, text=trimmed)

		recipients = conversation.participants.exclude(id=request.user.id)
		for recipient in recipients:
			MessageReceipt.objects.get_or_create(
				message=message,
				user=recipient,
				defaults={"status": MessageStatus.SENT},
			)

		self._broadcast_new_message(message, request.user.id)
		return Response(self.get_serializer(message).data, status=status.HTTP_201_CREATED)

	@action(detail=True, methods=["post"])
	def vote_poll(self, request, pk=None):
		message = self.get_object()
		if not hasattr(message, "poll"):
			return Response({"error": "Message has no poll."}, status=400)

		option_ids = request.data.get("option_ids")
		if option_ids is None:
			single_option_id = request.data.get("option_id")
			option_ids = [single_option_id] if single_option_id is not None else []
		if not isinstance(option_ids, list) or not option_ids:
			return Response({"error": "option_id or option_ids is required."}, status=400)

		poll = message.poll
		if not poll.allows_multiple and len(option_ids) > 1:
			return Response({"error": "Poll only allows one option."}, status=400)

		valid_options = list(poll.options.filter(id__in=option_ids))
		if len(valid_options) != len(set(option_ids)):
			return Response({"error": "One or more options are invalid."}, status=400)

		MessagePollVote.objects.filter(poll=poll, user=request.user).exclude(option_id__in=[opt.id for opt in valid_options]).delete()
		for option in valid_options:
			MessagePollVote.objects.get_or_create(
				poll=poll,
				option=option,
				user=request.user,
			)

		self._broadcast_message_update(message, request.user.id, "poll_vote")
		return Response(self.get_serializer(message).data)

	@action(detail=False, methods=["post"])
	def typing(self, request):
		conversation_id = request.data.get("conversation")
		is_typing = bool(request.data.get("is_typing", True))
		if not conversation_id:
			return Response({"error": "conversation is required."}, status=400)

		conversation = get_object_or_404(
			Conversation, id=conversation_id, participants=request.user
		)
		indicator, _ = TypingIndicator.objects.update_or_create(
			conversation=conversation,
			user=request.user,
			defaults={"is_typing": is_typing},
		)
		return Response(TypingIndicatorSerializer(indicator).data)

	@action(detail=False, methods=["get"])
	def unread_count(self, request):
		count = MessageReceipt.objects.filter(user=request.user).exclude(
			status=MessageStatus.READ
		).count()
		return Response({"count": count})

	@action(detail=True, methods=["post"])
	def react(self, request, pk=None):
		message = self.get_object()
		emoji = (request.data.get("emoji") or "").strip()

		if not emoji:
			return Response({"error": "emoji is required."}, status=400)

		reaction = MessageReaction.objects.filter(
			message=message,
			user=request.user,
			emoji=emoji,
		).first()

		if reaction:
			reaction.delete()
			status_label = "removed"
		else:
			MessageReaction.objects.create(
				message=message,
				user=request.user,
				emoji=emoji,
			)
			status_label = "reacted"

		reactions = self._build_reaction_summary(message, request.user.id)

		conversation = message.conversation
		channel_layer = get_channel_layer()
		event_payload = {
			"type": "message_reaction",
			"message_id": message.id,
			"reactions": reactions,
			"emoji": emoji,
			"action": status_label,
			"actor_id": request.user.id,
			"actor_username": request.user.username,
		}

		if conversation.conversation_type == ConversationType.DIRECT:
			participant_ids = list(
				conversation.participants.values_list("id", flat=True).order_by("id")
			)
			if len(participant_ids) == 2:
				room_name = f"dm_{participant_ids[0]}_{participant_ids[1]}"
				async_to_sync(channel_layer.group_send)(room_name, event_payload)
		elif conversation.conversation_type == ConversationType.GROUP:
			async_to_sync(channel_layer.group_send)(
				f"group_{conversation.id}",
				event_payload,
			)

		return Response({"status": status_label, "reactions": reactions})

	def _build_reaction_summary(self, message, current_user_id):
		grouped = {}
		for reaction in message.reactions.select_related("user").all():
			entry = grouped.setdefault(
				reaction.emoji,
				{
					"emoji": reaction.emoji,
					"count": 0,
					"reacted": False,
				},
			)
			entry["count"] += 1
			if reaction.user_id == current_user_id:
				entry["reacted"] = True

		return list(grouped.values())

	def _broadcast_receipt_update(self, message, user_id, receipt):
		conversation = message.conversation
		channel_layer = get_channel_layer()
		event_payload = {
			"type": "message_receipt_update",
			"message_id": message.id,
			"user_id": user_id,
			"status": receipt.status,
			"delivered_at": receipt.delivered_at.isoformat() if receipt.delivered_at else None,
			"read_at": receipt.read_at.isoformat() if receipt.read_at else None,
		}

		if conversation.conversation_type == ConversationType.DIRECT:
			participant_ids = list(
				conversation.participants.values_list("id", flat=True).order_by("id")
			)
			if len(participant_ids) == 2:
				room_name = f"dm_{participant_ids[0]}_{participant_ids[1]}"
				async_to_sync(channel_layer.group_send)(room_name, event_payload)
		elif conversation.conversation_type == ConversationType.GROUP:
			async_to_sync(channel_layer.group_send)(
				f"group_{conversation.id}",
				event_payload,
			)

	def _broadcast_new_message(self, message, sender_id):
		self._broadcast_message_update(message, sender_id, "created")

	def _broadcast_message_update(self, message, actor_id, action_type):
		conversation = message.conversation
		channel_layer = get_channel_layer()
		event_payload = {
			"type": "message_update",
			"message_id": message.id,
			"action": action_type,
			"actor_id": actor_id,
			"payload": self.get_serializer(message).data,
		}

		if conversation.conversation_type == ConversationType.DIRECT:
			participant_ids = list(conversation.participants.values_list("id", flat=True).order_by("id"))
			if len(participant_ids) == 2:
				room_name = f"dm_{participant_ids[0]}_{participant_ids[1]}"
				async_to_sync(channel_layer.group_send)(room_name, event_payload)
		else:
			async_to_sync(channel_layer.group_send)(f"group_{conversation.id}", event_payload)
