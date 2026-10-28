import { useCallback, useState } from 'react';
import supabase from '../lib/supabase';

const API_URL = 'https://w-a-t-c-h.onrender.com';

export function useProfilePicture() {
  const [profilePictureUrl, setProfilePictureUrl] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const loadProfilePicture = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      console.log('access token:', session?.access_token);

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        setProfilePictureUrl(null);
        return;
      }

      const response = await fetch(`${API_URL}/profile/picture`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to load profile picture (HTTP ${response.status})`,
        );
      }

      const result: { profile_pic: string | null } =
        await response.json();

      setProfilePictureUrl(result.profile_pic);
    } catch (error) {
      console.error('Profile picture error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    profilePictureUrl,
    loading,
    loadProfilePicture,
  };
}