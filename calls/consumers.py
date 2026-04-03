from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
import json
import re

User = get_user_model()
MENTION_RE = re.compile(r'(?<!\w)@(?P<username>[A-Za-z0-9_.-]{2,150})')


class CallConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling WebRTC signaling
    Handles: offer, answer, ice-candidate, call-end
    """
    
    async def connect(self):
        """
        Called when WebSocket connection is established
        """
        self.user = self.scope["user"]
        
        # Reject anonymous users
        if self.user.is_anonymous:
            await self.close()
            return
        
        # Get room name from URL
        self.room_name = self.scope['url_route']['kwargs'].get('room_name')
        if not self.room_name:
            await self.close()
            return
        
        self.room_group_name = f'call_{self.room_name}'
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # Update user's channel name and online status
        await self.update_user_channel(self.user.id, self.channel_name, True)
        
        await self.accept()
        
        # Notify user joined
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'user_id': self.user.id,
                'username': self.user.username
            }
        )
    
    async def disconnect(self, close_code):
        """
        Called when WebSocket connection is closed
        """
        # Update user's online status
        if hasattr(self, 'user') and not self.user.is_anonymous:
            await self.update_user_channel(self.user.id, None, False)
        
        # Leave room group
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            
            # Notify user left
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_left',
                    'user_id': self.user.id,
                    'username': self.user.username
                }
            )
    
    async def receive(self, text_data):
        """
        Called when message is received from WebSocket
        """
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            # Route message based on type
            if message_type == 'call-offer':
                await self.handle_call_offer(data)
            elif message_type == 'call-answer':
                await self.handle_call_answer(data)
            elif message_type == 'ice-candidate':
                await self.handle_ice_candidate(data)
            elif message_type == 'call-end':
                await self.handle_call_end(data)
            elif message_type == 'ringing':
                await self.handle_ringing(data)
            else:
                # Forward unknown message types
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'call_message',
                        'message': data,
                        'sender_id': self.user.id
                    }
                )
        
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'error': 'Invalid JSON'
            }))
    
    async def handle_call_offer(self, data):
        """
        Handle WebRTC offer
        """
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'call_offer',
                'offer': data.get('offer'),
                'sender_id': self.user.id,
                'target_id': data.get('target_id'),
                'call_id': data.get('call_id'),
                'call_type': data.get('call_type', 'audio')
            }
        )
        
        # Log signal to database (optional)
        if data.get('call_id'):
            await self.log_signal(data.get('call_id'), 'offer', data.get('offer'))
    
    async def handle_call_answer(self, data):
        """
        Handle WebRTC answer
        """
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'call_answer',
                'answer': data.get('answer'),
                'sender_id': self.user.id,
                'target_id': data.get('target_id'),
                'call_id': data.get('call_id')
            }
        )
        
        # Log signal to database (optional)
        if data.get('call_id'):
            await self.log_signal(data.get('call_id'), 'answer', data.get('answer'))
    
    async def handle_ice_candidate(self, data):
        """
        Handle ICE candidate
        """
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'ice_candidate',
                'candidate': data.get('candidate'),
                'sender_id': self.user.id,
                'target_id': data.get('target_id'),
                'call_id': data.get('call_id')
            }
        )
        
        # Log signal to database (optional)
        if data.get('call_id'):
            await self.log_signal(data.get('call_id'), 'ice-candidate', data.get('candidate'))
    
    async def handle_call_end(self, data):
        """
        Handle call end
        """
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'call_end',
                'sender_id': self.user.id,
                'call_id': data.get('call_id'),
                'reason': data.get('reason', 'ended')
            }
        )
    
    async def handle_ringing(self, data):
        """
        Handle ringing status
        """
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'call_ringing',
                'sender_id': self.user.id,
                'call_id': data.get('call_id')
            }
        )
        
        # Update call status to ringing
        if data.get('call_id'):
            await self.update_call_status(data.get('call_id'), 'ringing')
    
    # WebSocket message handlers (called by channel layer)
    
    async def call_offer(self, event):
        """Send offer to client"""
        await self.send(text_data=json.dumps({
            'type': 'call-offer',
            'offer': event['offer'],
            'sender_id': event['sender_id'],
            'target_id': event.get('target_id'),
            'call_id': event.get('call_id'),
            'call_type': event.get('call_type')
        }))
    
    async def call_answer(self, event):
        """Send answer to client"""
        await self.send(text_data=json.dumps({
            'type': 'call-answer',
            'answer': event['answer'],
            'sender_id': event['sender_id'],
            'target_id': event.get('target_id'),
            'call_id': event.get('call_id')
        }))
    
    async def ice_candidate(self, event):
        """Send ICE candidate to client"""
        await self.send(text_data=json.dumps({
            'type': 'ice-candidate',
            'candidate': event['candidate'],
            'sender_id': event['sender_id'],
            'target_id': event.get('target_id'),
            'call_id': event.get('call_id')
        }))
    
    async def call_end(self, event):
        """Send call end notification to client"""
        await self.send(text_data=json.dumps({
            'type': 'call-end',
            'sender_id': event['sender_id'],
            'call_id': event.get('call_id'),
            'reason': event.get('reason')
        }))
    
    async def call_ringing(self, event):
        """Send ringing status to client"""
        await self.send(text_data=json.dumps({
            'type': 'ringing',
            'sender_id': event['sender_id'],
            'call_id': event.get('call_id')
        }))
    
    async def user_joined(self, event):
        """Notify that a user joined the room"""
        # Don't send to self
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user-joined',
                'user_id': event['user_id'],
                'username': event['username']
            }))
    
    async def user_left(self, event):
        """Notify that a user left the room"""
        # Don't send to self
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user-left',
                'user_id': event['user_id'],
                'username': event['username']
            }))
    
    async def call_message(self, event):
        """Forward generic call messages"""
        if event.get('sender_id') != self.user.id:
            await self.send(text_data=json.dumps(event['message']))
    
    # Database helpers
    
    @database_sync_to_async
    def update_user_channel(self, user_id, channel_name, is_online):
        """Update user's channel name and online status"""
        try:
            user = User.objects.get(id=user_id)
            user.channel_name = channel_name
            user.is_online = is_online
            user.save()
        except User.DoesNotExist:
            pass
    
    @database_sync_to_async
    def log_signal(self, call_id, signal_type, signal_data):
        """Log WebRTC signal to database (optional for debugging)"""
        from .models import Call, CallSignal
        try:
            call = Call.objects.get(id=call_id)
            CallSignal.objects.create(
                call=call,
                signal_type=signal_type,
                signal_data=signal_data,
                sender=self.user
            )
        except Call.DoesNotExist:
            pass
    
    @database_sync_to_async
    def update_call_status(self, call_id, status):
        """Update call status"""
        from .models import Call
        from django.utils import timezone
        try:
            call = Call.objects.get(id=call_id)
            call.status = status
            if status == 'ringing':
                call.ringing_at = timezone.now()
            call.save()
        except Call.DoesNotExist:
            pass


class UserPresenceConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for user presence and incoming call notifications
    Each user connects to their personal channel to receive call notifications
    """
    
    async def connect(self):
        """Called when WebSocket connection is established"""
        self.user = self.scope["user"]
        
        print(f"UserPresenceConsumer connect: user={self.user}, is_anonymous={self.user.is_anonymous}")
        
        # Reject anonymous users
        if self.user.is_anonymous:
            print("❌ Rejecting anonymous user")
            await self.close()
            return
        
        # Personal channel for this user
        self.user_channel = f'user_{self.user.id}'
        
        print(f"✅ User {self.user.username} connecting to channel: {self.user_channel}")
        
        # Join personal channel
        await self.channel_layer.group_add(
            self.user_channel,
            self.channel_name
        )
        
        # Update user's channel name
        await self.update_user_channel(self.user.id, self.channel_name)
        
        await self.accept()
        print(f"✅ WebSocket accepted for user: {self.user.username}")
    
    async def disconnect(self, close_code):
        """Called when WebSocket connection is closed"""
        if hasattr(self, 'user_channel'):
            await self.channel_layer.group_discard(
                self.user_channel,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle messages from client (like ping/pong for keepalive)"""
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except:
            pass
    
    # Event handlers
    
    async def incoming_call(self, event):
        """Handle incoming call notification"""
        print(f"🔔 UserPresenceConsumer received incoming_call event for user {self.user.username}")
        print(f"   Event data: {event}")
        
        await self.send(text_data=json.dumps({
            'type': 'incoming-call',
            'call_id': event['call_id'],
            'caller': event['caller'],
            'caller_username': event['caller_username'],
            'call_type': event['call_type'],
            'room_id': event['room_id']
        }))
        
        print(f"✅ Incoming call notification sent to WebSocket")

    async def incoming_group_call(self, event):
        """Handle incoming conference/group call notification"""
        await self.send(text_data=json.dumps({
            'type': 'incoming-group-call',
            'conference_id': event['conference_id'],
            'conversation_id': event.get('conversation_id'),
            'title': event.get('title', ''),
            'host_id': event.get('host_id'),
            'host_username': event.get('host_username', ''),
            'call_type': event.get('call_type', 'video'),
            'room_id': event.get('room_id', ''),
        }))
    
    async def call_cancelled(self, event):
        """Handle call cancellation"""
        await self.send(text_data=json.dumps({
            'type': 'call-cancelled',
            'call_id': event['call_id']
        }))
    
    async def call_ended(self, event):
        """Handle call end notification"""
        await self.send(text_data=json.dumps({
            'type': 'call-ended',
            'call_id': event['call_id'],
            'call_data': event.get('call_data')
        }))
    
    @database_sync_to_async
    def update_user_channel(self, user_id, channel_name):
        """Update user's channel name"""
        try:
            user = User.objects.get(id=user_id)
            user.channel_name = channel_name
            user.save()
        except User.DoesNotExist:
            pass


# ============ DIRECT MESSAGE CONSUMER ============

class DirectMessageConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time direct messaging
    Users connect with their recipient user_id: /ws/messages/<recipient_id>/
    """
    
    async def connect(self):
        """Called when WebSocket connection is established"""
        self.user = self.scope["user"]
        
        if self.user.is_anonymous:
            await self.close()
            return
        
        # Get recipient user ID from URL
        self.recipient_id = self.scope['url_route']['kwargs'].get('recipient_id')
        if not self.recipient_id:
            await self.close()
            return
        
        # Validate recipient exists
        recipient = await self.get_user(self.recipient_id)
        if not recipient:
            await self.close()
            return
        
        # Create unique conversation room (always in order: smaller_id_first)
        user_ids = sorted([self.user.id, int(self.recipient_id)])
        self.room_name = f'dm_{user_ids[0]}_{user_ids[1]}'
        
        # Join the conversation group
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Called when WebSocket connection is closed"""
        if hasattr(self, 'room_name'):
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle incoming messages"""
        try:
            data = json.loads(text_data)

            if data.get('type') in ['message', 'chat_message']:
                content = data.get('content') or data.get('message')
                if not content:
                    return

                # Save message to database
                message = await self.save_direct_message(
                    sender_id=self.user.id,
                    receiver_id=int(self.recipient_id),
                    content=content
                )
                
                # Broadcast to conversation room
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        'type': 'direct_message',
                        'message_id': message.id,
                        'sender_id': self.user.id,
                        'sender_username': self.user.username,
                        'receiver_id': int(self.recipient_id),
                        'content': message.content,
                        'created_at': message.sent_at.isoformat(),
                    }
                )
            elif data.get('type') == 'typing':
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        'type': 'typing_update',
                        'user_id': self.user.id,
                        'username': self.user.username,
                        'is_typing': bool(data.get('is_typing', False)),
                    }
                )
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({'error': 'Invalid JSON'}))
    
    async def direct_message(self, event):
        """Send message to WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message_id': event['message_id'],
            'message': {
                'id': event['message_id'],
                'sender': {
                    'id': event['sender_id'],
                    'username': event['sender_username'],
                },
                'receiver': {
                    'id': event['receiver_id'],
                    'username': '',
                },
                'content': event['content'],
                'created_at': event['created_at'],
                'is_read': False,
            },
        }))
    
    async def user_online(self, event):
        """Notify that a user is online"""
        await self.send(text_data=json.dumps({
            'type': 'user-online',
            'user_id': event['user_id'],
            'is_online': True,
        }))
    
    async def user_offline(self, event):
        """Notify that a user is offline"""
        await self.send(text_data=json.dumps({
            'type': 'user-offline',
            'user_id': event['user_id'],
            'is_online': False,
        }))

    async def message_reaction(self, event):
        """Send message reaction updates to direct-message participants"""
        await self.send(text_data=json.dumps({
            'type': 'message-reaction',
            'message_id': event['message_id'],
            'reactions': event.get('reactions', []),
            'emoji': event.get('emoji'),
            'action': event.get('action'),
            'actor_id': event.get('actor_id'),
            'actor_username': event.get('actor_username'),
        }))

    async def message_receipt_update(self, event):
        """Send receipt updates for direct messages"""
        await self.send(text_data=json.dumps({
            'type': 'message-receipt-update',
            'message_id': event.get('message_id'),
            'user_id': event.get('user_id'),
            'status': event.get('status'),
            'delivered_at': event.get('delivered_at'),
            'read_at': event.get('read_at'),
        }))

    async def typing_update(self, event):
        """Send typing updates to direct-message participants"""
        await self.send(text_data=json.dumps({
            'type': 'typing',
            'user_id': event.get('user_id'),
            'username': event.get('username'),
            'is_typing': event.get('is_typing', False),
        }))

    async def message_update(self, event):
        """Send message edit/pin/poll update to direct-message participants"""
        await self.send(text_data=json.dumps({
            'type': 'message-update',
            'message_id': event.get('message_id'),
            'action': event.get('action'),
            'actor_id': event.get('actor_id'),
            'payload': event.get('payload'),
        }))
    
    @database_sync_to_async
    def save_direct_message(self, sender_id, receiver_id, content):
        """Save direct message to database"""
        from messaging.models import (
            Conversation,
            ConversationParticipant,
            ConversationType,
            Message,
            MessageReceipt,
            MessageStatus,
        )
        from django.utils import timezone
        from datetime import timedelta

        conversation = (
            Conversation.objects.filter(conversation_type=ConversationType.DIRECT)
            .filter(participants__id=sender_id)
            .filter(participants__id=receiver_id)
            .distinct()
            .first()
        )

        if not conversation:
            conversation = Conversation.objects.create(
                conversation_type=ConversationType.DIRECT,
                created_by_id=sender_id,
                encrypted=True,
            )
            ConversationParticipant.objects.create(
                conversation=conversation, user_id=sender_id, is_admin=True
            )
            ConversationParticipant.objects.create(
                conversation=conversation, user_id=receiver_id, is_admin=False
            )

        message = Message.objects.create(
            conversation=conversation,
            sender_id=sender_id,
            content=content,
            encrypted=True,
        )

        sender = message.sender
        default_hours = 24
        if hasattr(sender, 'settings') and sender.settings:
            default_hours = sender.settings.default_message_expiration_hours or 24
        message.expires_at = timezone.now() + timedelta(hours=default_hours)
        message.save(update_fields=['expires_at'])

        mention_usernames = {m.group('username') for m in MENTION_RE.finditer(content or '')}
        if mention_usernames:
            mention_users = conversation.participants.filter(username__in=mention_usernames)
            message.mentioned_users.add(*mention_users)

        MessageReceipt.objects.get_or_create(
            message=message,
            user_id=receiver_id,
            defaults={'status': MessageStatus.SENT},
        )

        return message
    
    @database_sync_to_async
    def get_user(self, user_id):
        """Get user by ID"""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None


# ============ GROUP MESSAGE CONSUMER ============

class GroupMessageConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for group messaging
    Users connect with group_id: /ws/group/<group_id>/
    """
    
    async def connect(self):
        """Called when WebSocket connection is established"""
        self.user = self.scope["user"]
        
        if self.user.is_anonymous:
            await self.close()
            return
        
        # Get group ID from URL
        self.group_id = self.scope['url_route']['kwargs'].get('group_id')
        if not self.group_id:
            await self.close()
            return
        
        # Check if user is member of group
        is_member = await self.check_group_membership(self.user.id, self.group_id)
        if not is_member:
            await self.close()
            return
        
        self.room_name = f'group_{self.group_id}'
        
        # Join group room
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )
        
        # Notify others that user came online
        await self.channel_layer.group_send(
            self.room_name,
            {
                'type': 'user_joined',
                'user_id': self.user.id,
                'username': self.user.username,
            }
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Called when WebSocket connection is closed"""
        if hasattr(self, 'room_name'):
            # Notify others that user went offline
            await self.channel_layer.group_send(
                self.room_name,
                {
                    'type': 'user_left',
                    'user_id': self.user.id,
                    'username': self.user.username,
                }
            )
            
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle incoming messages"""
        try:
            data = json.loads(text_data)

            # Re-check membership for each incoming message in case user was removed
            # after websocket connection was established.
            is_member = await self.check_group_membership(self.user.id, self.group_id)
            if not is_member:
                await self.close(code=4003)
                return
            
            if data.get('type') == 'message':
                # Save message to database
                message = await self.save_group_message(
                    sender_id=self.user.id,
                    group_id=int(self.group_id),
                    content=data.get('content')
                )
                
                # Broadcast to group
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        'type': 'group_message',
                        'message_id': message.id,
                        'sender_id': self.user.id,
                        'sender_username': self.user.username,
                        'group_id': int(self.group_id),
                        'content': message.content,
                        'created_at': message.sent_at.isoformat(),
                    }
                )
            elif data.get('type') == 'typing':
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        'type': 'typing_update',
                        'user_id': self.user.id,
                        'username': self.user.username,
                        'is_typing': bool(data.get('is_typing', False)),
                    }
                )
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({'error': 'Invalid JSON'}))
    
    async def group_message(self, event):
        """Send message to WebSocket"""
        is_member = await self.check_group_membership(self.user.id, self.group_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.send(text_data=json.dumps({
            'type': 'message',
            'message_id': event['message_id'],
            'sender_id': event['sender_id'],
            'sender_username': event['sender_username'],
            'group_id': event['group_id'],
            'content': event['content'],
            'created_at': event['created_at'],
        }))
    
    async def user_joined(self, event):
        """Notify that a user joined the group"""
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user-joined',
                'user_id': event['user_id'],
                'username': event['username'],
            }))
    
    async def user_left(self, event):
        """Notify that a user left the group"""
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user-left',
                'user_id': event['user_id'],
                'username': event['username'],
            }))

    async def message_reaction(self, event):
        """Send message reaction updates to group participants"""
        is_member = await self.check_group_membership(self.user.id, self.group_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.send(text_data=json.dumps({
            'type': 'message-reaction',
            'message_id': event['message_id'],
            'reactions': event.get('reactions', []),
            'emoji': event.get('emoji'),
            'action': event.get('action'),
            'actor_id': event.get('actor_id'),
            'actor_username': event.get('actor_username'),
        }))

    async def message_receipt_update(self, event):
        """Send receipt updates for group messages"""
        is_member = await self.check_group_membership(self.user.id, self.group_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.send(text_data=json.dumps({
            'type': 'message-receipt-update',
            'message_id': event.get('message_id'),
            'user_id': event.get('user_id'),
            'status': event.get('status'),
            'delivered_at': event.get('delivered_at'),
            'read_at': event.get('read_at'),
        }))

    async def typing_update(self, event):
        """Send typing updates to group participants"""
        is_member = await self.check_group_membership(self.user.id, self.group_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.send(text_data=json.dumps({
            'type': 'typing',
            'user_id': event.get('user_id'),
            'username': event.get('username'),
            'is_typing': event.get('is_typing', False),
        }))

    async def message_update(self, event):
        """Send message edit/pin/poll update to group participants"""
        is_member = await self.check_group_membership(self.user.id, self.group_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.send(text_data=json.dumps({
            'type': 'message-update',
            'message_id': event.get('message_id'),
            'action': event.get('action'),
            'actor_id': event.get('actor_id'),
            'payload': event.get('payload'),
        }))
    
    @database_sync_to_async
    def check_group_membership(self, user_id, group_id):
        """Check if user is active participant in conversation group"""
        from messaging.models import Conversation, ConversationType

        return Conversation.objects.filter(
            id=group_id,
            conversation_type=ConversationType.GROUP,
            participant_entries__user_id=user_id,
            participant_entries__is_active=True,
            is_active=True,
        ).exists()
    
    @database_sync_to_async
    def save_group_message(self, sender_id, group_id, content):
        """Save group message to messaging.Message"""
        from messaging.models import Conversation, Message
        from django.utils import timezone
        from datetime import timedelta

        conversation = Conversation.objects.get(id=group_id)
        message = Message.objects.create(
            conversation=conversation,
            sender_id=sender_id,
            content=content,
            encrypted=True,
        )
        sender = message.sender
        default_hours = 24
        if hasattr(sender, 'settings') and sender.settings:
            default_hours = sender.settings.default_message_expiration_hours or 24
        message.expires_at = timezone.now() + timedelta(hours=default_hours)
        message.save(update_fields=['expires_at'])
        mention_usernames = {m.group('username') for m in MENTION_RE.finditer(content or '')}
        if mention_usernames:
            mention_users = conversation.participants.filter(username__in=mention_usernames)
            message.mentioned_users.add(*mention_users)
        return message


# ============ USER ONLINE STATUS CONSUMER ============

class UserStatusConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for tracking user online status
    Each user connects to receive real-time online users list
    """
    
    async def connect(self):
        """Called when WebSocket connection is established"""
        self.user = self.scope["user"]
        
        if self.user.is_anonymous:
            await self.close()
            return
        
        # Join global status broadcast channel
        self.broadcast_channel = 'online_users_broadcast'
        
        await self.channel_layer.group_add(
            self.broadcast_channel,
            self.channel_name
        )
        
        # Update user online status
        await self.update_user_online_status(self.user.id, True)
        
        await self.accept()
        
        # Send current list of online users to newly connected client
        online_users = await self.get_online_users()
        await self.send(text_data=json.dumps({
            'type': 'online_users',
            'users': online_users
        }))
        
        # Notify all other users that this user came online
        if self.user.online_status != 'invisible':
            await self.channel_layer.group_send(
                self.broadcast_channel,
                {
                    'type': 'user_online_status',
                    'user_id': self.user.id,
                    'username': self.user.username,
                    'email': self.user.email,
                    'is_online': True,
                    'online_status': self.user.online_status,
                    'exclude_user': self.user.id  # Don't send to self
                }
            )
    
    async def disconnect(self, close_code):
        """Called when WebSocket connection is closed"""
        if not hasattr(self, 'user') or self.user.is_anonymous:
            return

        broadcast_channel = getattr(self, 'broadcast_channel', None)

        # Update user online status
        await self.update_user_online_status(self.user.id, False)
        
        # Notify all other users that this user went offline
        if broadcast_channel:
            await self.channel_layer.group_send(
                broadcast_channel,
                {
                    'type': 'user_online_status',
                    'user_id': self.user.id,
                    'username': self.user.username,
                    'is_online': False,
                    'online_status': self.user.online_status,
                    'exclude_user': self.user.id  # Don't send to self
                }
            )
        
        if broadcast_channel:
            await self.channel_layer.group_discard(
                broadcast_channel,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle keepalive messages"""
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except:
            pass
    
    async def user_online_status(self, event):
        """Send user status change to connected clients"""
        # Don't send to the user who's status changed
        if event.get('exclude_user') != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user_status_change',
                'user_id': event['user_id'],
                'username': event['username'],
                'email': event.get('email'),
                'is_online': event['is_online'],
                'online_status': event.get('online_status', 'available'),
            }))
    
    @database_sync_to_async
    def get_online_users(self):
        """Get list of all online users"""
        online_users = User.objects.filter(is_online=True).exclude(online_status='invisible').exclude(id=self.user.id)
        return [{
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_online': True,
            'online_status': user.online_status,
            'last_seen': user.last_seen.isoformat() if user.last_seen else None,
            'profile_picture': user.profile_picture.url if user.profile_picture else None
        } for user in online_users]
    
    @database_sync_to_async
    def update_user_online_status(self, user_id, is_online):
        """Update user's online status in database"""
        try:
            user = User.objects.get(id=user_id)
            user.is_online = is_online
            user.save()
        except User.DoesNotExist:
            pass


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time notifications
    """
    
    async def connect(self):
        """Called when WebSocket connection is established"""
        self.user = self.scope["user"]
        
        # Reject anonymous users
        if self.user.is_anonymous:
            await self.close()
            return
        
        # Join user's notification channel
        self.notification_group_name = f'notifications_{self.user.id}'
        
        await self.channel_layer.group_add(
            self.notification_group_name,
            self.channel_name
        )
        
        # Update user's channel name for notifications
        await self.update_user_channel(self.user.id, self.channel_name)
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Called when WebSocket connection is closed"""
        # Leave notification group
        if hasattr(self, 'notification_group_name'):
            await self.channel_layer.group_discard(
                self.notification_group_name,
                self.channel_name
            )
            
            # Clear user's channel name
            await self.update_user_channel(self.user.id, None)
    
    async def notification_message(self, event):
        """Send notification to WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'notification': event['notification']
        }))
    
    @database_sync_to_async
    def update_user_channel(self, user_id, channel_name):
        """Update user's channel name in database"""
        try:
            user = User.objects.get(id=user_id)
            user.channel_name = channel_name
            user.save(update_fields=['channel_name'])
        except User.DoesNotExist:
            pass
