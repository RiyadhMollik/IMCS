import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useAuth } from '../contexts/AuthContext';

export interface FriendRequest {
  id: number;
  sender: {
    id: number;
    username: string;
    profile_pic: string | null;
  };
  receiver: {
    id: number;
    username: string;
    profile_pic: string | null;
  };
  status: 'pending' | 'accepted' | 'rejected';
  mutual_friends_count: number;
  created_at: string;
}

export interface Friend {
  id: number;
  username: string;
  profile_pic: string | null;
  is_online: boolean;
}

export const useFriendRequests = () => {
  const { isAuthenticated } = useAuth();
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = 'http://localhost:8001/api';

  const getToken = () => Cookies.get('access_token');

  // Fetch received friend requests
  const fetchReceivedRequests = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/friend-requests/received/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReceivedRequests(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch friend requests');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sent friend requests
  const fetchSentRequests = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/friend-requests/sent/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSentRequests(response.data);
    } catch (err: any) {
      console.error('Failed to fetch sent requests:', err);
    }
  }, []);

  // Fetch friends list
  const fetchFriends = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/friend-requests/friends/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriends(response.data);
    } catch (err: any) {
      console.error('Failed to fetch friends:', err);
    }
  }, []);

  // Send friend request
  const sendFriendRequest = async (receiverId: number) => {
    const token = getToken();
    if (!token) return;
    
    try {
      setLoading(true);
      await axios.post(
        `${API_BASE_URL}/friend-requests/`,
        { receiver_id: receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchSentRequests();
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send friend request');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Accept friend request
  const acceptFriendRequest = async (requestId: number) => {
    const token = getToken();
    if (!token) return;
    
    try {
      setLoading(true);
      await axios.post(
        `${API_BASE_URL}/friend-requests/${requestId}/accept/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchReceivedRequests();
      await fetchFriends();
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept friend request');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Reject friend request
  const rejectFriendRequest = async (requestId: number) => {
    const token = getToken();
    if (!token) return;
    
    try {
      setLoading(true);
      await axios.post(
        `${API_BASE_URL}/friend-requests/${requestId}/reject/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchReceivedRequests();
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reject friend request');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Load initial data
  useEffect(() => {
    if (isAuthenticated) {
      fetchReceivedRequests();
      fetchSentRequests();
      fetchFriends();
    }
  }, [isAuthenticated, fetchReceivedRequests, fetchSentRequests, fetchFriends]);

  return {
    receivedRequests,
    sentRequests,
    friends,
    loading,
    error,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    refreshReceivedRequests: fetchReceivedRequests,
    refreshSentRequests: fetchSentRequests,
    refreshFriends: fetchFriends,
  };
};
