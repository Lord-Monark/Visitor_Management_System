import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType, LoginCredentials, SignupCredentials } from '../types/auth';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchUserProfile(session.user);
      }
      setIsLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchUserProfile(session.user);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (authUser: SupabaseUser) => {
    try {
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }

      if (userProfile) {
        const userData: User = {
          id: userProfile.id,
          name: userProfile.name,
          email: userProfile.email,
          role: userProfile.role,
          department: userProfile.department,
          createdAt: new Date(userProfile.created_at),
          lastLogin: userProfile.last_login ? new Date(userProfile.last_login) : undefined,
        };
        setUser(userData);

        // Update last login
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', userProfile.id);
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  };

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      // First, sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (authError) {
        console.error('Auth error:', authError);
        setIsLoading(false);
        return false;
      }

      if (authData.user) {
        // Fetch user profile to check role
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();

        let finalUserProfile = userProfile;

        // If no profile found by auth_user_id, try to find by email (for pre-seeded users)
        if (!userProfile && !profileError) {
          const { data: emailProfile, error: emailError } = await supabase
            .from('users')
            .select('*')
            .eq('email', authData.user.email)
            .is('auth_user_id', null)
            .maybeSingle();

          if (emailProfile && !emailError) {
            // Link the pre-seeded user to the auth user
            const { data: updatedProfile, error: updateError } = await supabase
              .from('users')
              .update({ auth_user_id: authData.user.id })
              .eq('id', emailProfile.id)
              .select('*')
              .single();

            if (updatedProfile && !updateError) {
              finalUserProfile = updatedProfile;
            }
          }
        }

        if (profileError || !finalUserProfile) {
          console.error('Profile error:', profileError);
          await supabase.auth.signOut();
          setIsLoading(false);
          return false;
        }

        // Check if role matches
        if (finalUserProfile.role !== credentials.role) {
          await supabase.auth.signOut();
          setIsLoading(false);
          return false;
        }

        // User profile will be set by the auth state change listener
        setIsLoading(false);
        return true;
      }

      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false);
      return false;
    }
  };

  const signup = async (credentials: SignupCredentials): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      // First, sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
      });

      if (authError) {
        console.error('Auth signup error:', authError);
        setIsLoading(false);
        return false;
      }

      if (authData.user) {
        // Create user profile
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            auth_user_id: authData.user.id,
            email: credentials.email,
            name: credentials.name,
            role: credentials.role,
            department: credentials.department || 'General',
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
          // Clean up auth user if profile creation fails
          await supabase.auth.signOut();
          setIsLoading(false);
          return false;
        }

        // User profile will be set by the auth state change listener
        setIsLoading(false);
        return true;
      }

      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Signup error:', error);
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};