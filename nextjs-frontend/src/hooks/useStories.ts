import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useAuth } from '../contexts/AuthContext';

export interface Story {
  id: number;
  author: {
    id: number;
    username: string;
    profile_picture: string | null;
  };
  image: string | null;
  video: string | null;
  text_content: string;
  background_color: string;
  created_at: string;
  expires_at: string;
  views_count: number;
  is_expired: boolean;
  is_viewed_by_me: boolean;
  time_ago: string;
}

export interface StoryGroup {
  user: {
    id: number;
    username: string;
    profile_pic: string | null;
  };
  stories: Story[];
  has_unseen: boolean;
}

export const useStories = () => {
  const { isAuthenticated } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [friendsStories, setFriendsStories] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = 'http://localhost:8001/api';

  const getToken = () => Cookies.get('access_token');

  // Fetch all stories (friends + mine)
  const fetchStories = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/stories/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStories(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch stories');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch stories grouped by user
  const fetchFriendsStories = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/stories/friends_stories/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFriendsStories(response.data);
    } catch (err: any) {
      console.error('Failed to fetch friends stories:', err);
    }
  }, []);

  // Fetch my stories
  const fetchMyStories = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/stories/my_stories/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyStories(response.data);
    } catch (err: any) {
      console.error('Failed to fetch my stories:', err);
    }
  }, []);

  // Create story
  const createStory = async (formData: FormData) => {
    const token = getToken();
    if (!token) return false;
    
    try {
      setLoading(true);
      await axios.post(
        `${API_BASE_URL}/stories/`,
        formData,
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          } 
        }
      );
      await fetchStories();
      await fetchMyStories();
      await fetchFriendsStories();
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create story');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // View story
  const viewStory = async (storyId: number) => {
    const token = getToken();
    if (!token) return;
    
    try {
      await axios.post(
        `${API_BASE_URL}/stories/${storyId}/view_story/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Update local state
      setStories(stories.map(s => 
        s.id === storyId ? { ...s, is_viewed_by_me: true } : s
      ));
    } catch (err: any) {
      console.error('Failed to mark story as viewed:', err);
    }
  };

  // Delete story
  const deleteStory = async (storyId: number) => {
    const token = getToken();
    if (!token) return false;
    
    try {
      await axios.delete(
        `${API_BASE_URL}/stories/${storyId}/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchStories();
      await fetchMyStories();
      await fetchFriendsStories();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete story');
      return false;
    }
  };

  // Load initial data
  useEffect(() => {
    if (isAuthenticated) {
      fetchStories();
      fetchMyStories();
      fetchFriendsStories();
    }
  }, [isAuthenticated, fetchStories, fetchMyStories, fetchFriendsStories]);

  return {
    stories,
    friendsStories,
    myStories,
    loading,
    error,
    createStory,
    viewStory,
    deleteStory,
    refreshStories: fetchStories,
    refreshMyStories: fetchMyStories,
    refreshFriendsStories: fetchFriendsStories,
  };
};
