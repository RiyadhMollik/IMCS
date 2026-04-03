import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
	Call,
	CallStatus,
	ConferenceCall,
	ConferenceParticipant,
	ConferenceParticipantRole,
	ConferenceParticipantStatus,
)
from .serializers import (
	CallCreateSerializer,
	CallSerializer,
	ConferenceCallSerializer,
	ConferenceCreateSerializer,
)


class CallViewSet(viewsets.ModelViewSet):
	queryset = Call.objects.select_related("caller", "receiver").all()
	serializer_class = CallSerializer
	permission_classes = [IsAuthenticated]

	def get_queryset(self):
		user = self.request.user
		return self.queryset.filter(Q(caller=user) | Q(receiver=user))

	def create(self, request, *args, **kwargs):
		serializer = CallCreateSerializer(data=request.data, context={"request": request})
		serializer.is_valid(raise_exception=True)

		receiver = serializer.validated_data["receiver_obj"]
		call = Call.objects.create(
			caller=request.user,
			receiver=receiver,
			call_type=serializer.validated_data["call_type"],
			status=CallStatus.INITIATED,
			room_id=str(uuid.uuid4()),
		)

		# Send incoming call event to receiver's personal websocket group.
		channel_layer = get_channel_layer()
		async_to_sync(channel_layer.group_send)(
			f"user_{receiver.id}",
			{
				"type": "incoming_call",
				"call_id": call.id,
				"caller": request.user.id,
				"caller_username": request.user.username,
				"call_type": call.call_type,
				"room_id": call.room_id,
			},
		)

		return Response(CallSerializer(call).data, status=status.HTTP_201_CREATED)

	@action(detail=False, methods=["post"])
	def start(self, request):
		return self.create(request)

	@action(detail=True, methods=["post"])
	def accept(self, request, pk=None):
		call = self.get_object()

		if call.receiver != request.user:
			return Response(
				{"error": "You are not authorized to accept this call."},
				status=status.HTTP_403_FORBIDDEN,
			)

		if call.status not in [CallStatus.INITIATED, CallStatus.RINGING]:
			return Response(
				{"error": f"Call cannot be accepted in status '{call.status}'."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		call.status = CallStatus.ACCEPTED
		call.accepted_at = timezone.now()
		call.save(update_fields=["status", "accepted_at"])
		return Response(CallSerializer(call).data)

	@action(detail=True, methods=["post"])
	def reject(self, request, pk=None):
		call = self.get_object()

		if call.receiver != request.user:
			return Response(
				{"error": "You are not authorized to reject this call."},
				status=status.HTTP_403_FORBIDDEN,
			)

		if call.status not in [CallStatus.INITIATED, CallStatus.RINGING]:
			return Response(
				{"error": f"Call cannot be rejected in status '{call.status}'."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		call.status = CallStatus.REJECTED
		call.ended_at = timezone.now()
		call.save(update_fields=["status", "ended_at"])

		# Send real-time notification to both users
		channel_layer = get_channel_layer()
		call_data = CallSerializer(call).data

		# Notify caller
		async_to_sync(channel_layer.group_send)(
			f"user_{call.caller.id}",
			{
				"type": "call_ended",
				"call_id": call.id,
				"call_data": call_data,
			}
		)

		# Notify receiver
		async_to_sync(channel_layer.group_send)(
			f"user_{call.receiver.id}",
			{
				"type": "call_ended",
				"call_id": call.id,
				"call_data": call_data,
			}
		)

		return Response(CallSerializer(call).data)

	@action(detail=True, methods=["post"])
	def end(self, request, pk=None):
		call = self.get_object()

		if call.caller != request.user and call.receiver != request.user:
			return Response(
				{"error": "You are not part of this call."},
				status=status.HTTP_403_FORBIDDEN,
			)

		if call.status == CallStatus.ACCEPTED:
			call.status = CallStatus.ENDED
			call.ended_at = timezone.now()
			call.calculate_duration()
			call.save(update_fields=["status", "ended_at", "duration"])

			# Send real-time notification to both users
			channel_layer = get_channel_layer()
			call_data = CallSerializer(call).data

			# Notify caller
			async_to_sync(channel_layer.group_send)(
				f"user_{call.caller.id}",
				{
					"type": "call_ended",
					"call_id": call.id,
					"call_data": call_data,
				}
			)

			# Notify receiver
			async_to_sync(channel_layer.group_send)(
				f"user_{call.receiver.id}",
				{
					"type": "call_ended",
					"call_id": call.id,
					"call_data": call_data,
				}
			)

		return Response(CallSerializer(call).data)

	@action(detail=False, methods=["get"])
	def history(self, request):
		calls = self.get_queryset().order_by("-initiated_at")

		other_user = request.query_params.get("other_user")
		if other_user:
			try:
				other_user_id = int(other_user)
			except (TypeError, ValueError):
				return Response(
					{"error": "other_user must be a valid user id."},
					status=status.HTTP_400_BAD_REQUEST,
				)

			calls = calls.filter(
				Q(caller=request.user, receiver_id=other_user_id)
				| Q(receiver=request.user, caller_id=other_user_id)
			)

		call_filter = request.query_params.get("filter", "all")
		if call_filter == "incoming":
			calls = calls.filter(receiver=request.user)
		elif call_filter == "outgoing":
			calls = calls.filter(caller=request.user)
		elif call_filter == "missed":
			calls = calls.filter(
				receiver=request.user,
				status__in=[CallStatus.MISSED, CallStatus.REJECTED],
			)

		calls = calls[:100]
		return Response(CallSerializer(calls, many=True).data)


class ConferenceCallViewSet(viewsets.ModelViewSet):
	queryset = ConferenceCall.objects.select_related("host").prefetch_related(
		"participants", "participants__user"
	)
	serializer_class = ConferenceCallSerializer
	permission_classes = [IsAuthenticated]

	def get_queryset(self):
		user = self.request.user
		return self.queryset.filter(
			Q(host=user) | Q(participants__user=user, participants__is_active=True)
		).distinct()

	def create(self, request, *args, **kwargs):
		serializer = ConferenceCreateSerializer(data=request.data, context={"request": request})
		serializer.is_valid(raise_exception=True)
		conversation = serializer.validated_data.get("conversation_obj")

		conference = ConferenceCall.objects.create(
			host=request.user,
			conversation=conversation,
			title=serializer.validated_data.get("title", ""),
			room_id=str(uuid.uuid4()),
			call_type=serializer.validated_data.get("call_type"),
			max_participants=serializer.validated_data.get("max_participants", 150),
			encrypted=True,
		)

		ConferenceParticipant.objects.create(
			conference=conference,
			user=request.user,
			role=ConferenceParticipantRole.HOST,
			status=ConferenceParticipantStatus.JOINED,
			is_active=True,
			joined_at=timezone.now(),
		)

		participant_ids = serializer.validated_data.get("participant_ids", [])
		for participant_id in participant_ids:
			if participant_id == request.user.id:
				continue
			ConferenceParticipant.objects.get_or_create(
				conference=conference,
				user_id=participant_id,
				defaults={
					"role": ConferenceParticipantRole.PARTICIPANT,
					"status": ConferenceParticipantStatus.INVITED,
					"is_active": True,
				},
			)

		# Notify invited participants via their personal presence channels.
		channel_layer = get_channel_layer()
		for participant_id in participant_ids:
			if participant_id == request.user.id:
				continue
			async_to_sync(channel_layer.group_send)(
				f"user_{participant_id}",
				{
					"type": "incoming_group_call",
					"conference_id": conference.id,
					"conversation_id": conference.conversation_id,
					"title": conference.title,
					"host_id": request.user.id,
					"host_username": request.user.username,
					"call_type": conference.call_type,
					"room_id": conference.room_id,
				},
			)

		self.log_conference_event(
			conference,
			request.user,
			f"Started a {conference.call_type} group call",
		)

		return Response(
			ConferenceCallSerializer(conference).data, status=status.HTTP_201_CREATED
		)

	@action(detail=True, methods=["post"])
	def add_participant(self, request, pk=None):
		conference = self.get_object()
		if conference.host != request.user:
			return Response({"error": "Only host can add participants."}, status=403)

		user_id = request.data.get("user_id")
		if not user_id:
			return Response({"error": "user_id is required."}, status=400)

		participant, _ = ConferenceParticipant.objects.get_or_create(
			conference=conference,
			user_id=user_id,
			defaults={
				"role": ConferenceParticipantRole.PARTICIPANT,
				"status": ConferenceParticipantStatus.INVITED,
				"is_active": True,
			},
		)
		if not participant.is_active:
			participant.is_active = True
			participant.status = ConferenceParticipantStatus.INVITED
			participant.left_at = None
			participant.save(update_fields=["is_active", "status", "left_at"])

		return Response({"status": "participant_added"})

	@action(detail=True, methods=["post"])
	def remove_participant(self, request, pk=None):
		conference = self.get_object()
		if conference.host != request.user:
			return Response({"error": "Only host can remove participants."}, status=403)

		user_id = request.data.get("user_id")
		if not user_id:
			return Response({"error": "user_id is required."}, status=400)

		participant = get_object_or_404(
			ConferenceParticipant, conference=conference, user_id=user_id
		)
		participant.is_active = False
		participant.status = ConferenceParticipantStatus.REMOVED
		participant.left_at = timezone.now()
		participant.save(update_fields=["is_active", "status", "left_at"])
		return Response({"status": "participant_removed"})

	@action(detail=True, methods=["post"])
	def join(self, request, pk=None):
		conference = self.get_object()
		participant, _ = ConferenceParticipant.objects.get_or_create(
			conference=conference,
			user=request.user,
			defaults={
				"role": ConferenceParticipantRole.PARTICIPANT,
				"status": ConferenceParticipantStatus.JOINED,
				"is_active": True,
				"joined_at": timezone.now(),
			},
		)

		participant.status = ConferenceParticipantStatus.JOINED
		participant.is_active = True
		participant.joined_at = timezone.now()
		participant.left_at = None
		participant.save(
			update_fields=["status", "is_active", "joined_at", "left_at"]
		)
		self.log_conference_event(
			conference,
			request.user,
			"Joined the call",
		)
		return Response({"status": "joined"})

	@action(detail=True, methods=["post"])
	def leave(self, request, pk=None):
		conference = self.get_object()
		participant = get_object_or_404(
			ConferenceParticipant, conference=conference, user=request.user
		)
		participant.status = ConferenceParticipantStatus.LEFT
		participant.is_active = False
		participant.left_at = timezone.now()
		participant.save(update_fields=["status", "is_active", "left_at"])
		self.log_conference_event(
			conference,
			request.user,
			"Left the call",
		)

		if conference.participants.filter(is_active=True).count() == 0:
			conference.status = "ended"
			conference.ended_at = timezone.now()
			conference.save(update_fields=["status", "ended_at"])
			self.log_conference_event(
				conference,
				request.user,
				"Call ended",
			)
		return Response({"status": "left"})

	def log_conference_event(self, conference, actor, event_text):
		"""Store conference events in group chat history and broadcast in realtime."""
		if not conference.conversation_id:
			return

		from messaging.models import Message

		message = Message.objects.create(
			conversation_id=conference.conversation_id,
			sender=actor,
			content=f"[CALL_EVENT]{actor.username}|{event_text}|{conference.id}|{conference.call_type}",
			encrypted=True,
		)

		channel_layer = get_channel_layer()
		async_to_sync(channel_layer.group_send)(
			f"group_{conference.conversation_id}",
			{
				"type": "group_message",
				"message_id": message.id,
				"sender_id": actor.id,
				"sender_username": actor.username,
				"group_id": conference.conversation_id,
				"content": message.content,
				"created_at": message.sent_at.isoformat(),
			},
		)
