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
      // Check if this is a demo user first
      const { data: demoUser, error: demoError } = await supabase
        .from('users')
        .select('*')
        .eq('email', credentials.email)
        .eq('role', credentials.role)
        .maybeSingle();

      if (demoError) {
        console.error('Demo user check error:', demoError);
        setIsLoading(false);
        return false;
      }

      // For demo users with specific passwords, simulate authentication
      const demoCredentials = {
        'admin@company.com': 'admin123',
        'john@company.com': 'employee123',
        'guard@company.com': 'guard123'
      };

      if (demoUser && demoCredentials[credentials.email as keyof typeof demoCredentials] === credentials.password) {
        // Create user session for demo user
        const userData: User = {
          id: demoUser.id,
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          department: demoUser.department,
          createdAt: new Date(demoUser.created_at),
          lastLogin: new Date(),
        };
        
        setUser(userData);
        
        // Update last login
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', demoUser.id);
        
        setIsLoading(false);
        return true;
      }

      // For non-demo users, try regular Supabase Auth
      try {
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

          if (profileError || !userProfile) {
            console.error('Profile error:', profileError);
            await supabase.auth.signOut();
            setIsLoading(false);
            return false;
          }

          // Check if role matches
          if (userProfile.role !== credentials.role) {
            await supabase.auth.signOut();
            setIsLoading(false);
            return false;
          }

          // User profile will be set by the auth state change listener
          setIsLoading(false);
          return true;
        }
      } catch (authError) {
        console.error('Supabase auth failed, checking for demo user:', authError);
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
    // Only sign out from Supabase Auth if user has auth_user_id
    if (user?.id) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('auth_user_id')
        .eq('id', user.id)
        .maybeSingle();
      
      if (userProfile?.auth_user_id) {
        await supabase.auth.signOut();
      }
    }
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