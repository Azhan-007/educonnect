'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { AuthService } from '@/services/authService';
import { SchoolService } from '@/services/schoolService';
import { School, User } from '@/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authChecked, setAuthChecked] = useState(false);
  const { 
    user, 
    setUser, 
    setLoading, 
    setAvailableSchools, 
    setCurrentSchool,
    currentSchool,
  } = useAuthStore();

  // Load schools based on user role
  const loadUserSchools = async (userData: User) => {
    try {
      if (userData.role === 'SuperAdmin') {
        const schoolIds = userData.schoolIds || [];
        
        if (schoolIds.length > 0) {
          const schools = await Promise.all(
            schoolIds.map((id: string) => SchoolService.getSchoolById(id))
          );
          const validSchools = schools.filter((s): s is School => s !== null);
          setAvailableSchools(validSchools);
          
          if (!currentSchool && validSchools.length > 0) {
            setCurrentSchool(validSchools[0]);
          }
        } else {
          const allSchools = await SchoolService.getSchools();
          setAvailableSchools(allSchools);
          
          if (!currentSchool && allSchools.length > 0) {
            setCurrentSchool(allSchools[0]);
          }
        }
      } else {
        // Non-SuperAdmin: use /school/me endpoint (doesn't require SuperAdmin)
        const school = await SchoolService.getMySchool();
        if (school) {
          setAvailableSchools([school]);
          setCurrentSchool(school);
        }
      }
    } catch (error) {
      console.error('Error loading user schools:', error);
    }
  };

  // Initial auth check - runs only once on mount
  useEffect(() => {
    // If user already exists in state (persisted or demo), we're good
    if (user) {
      setAuthChecked(true);
      // Always attempt to load schools if currentSchool is not set
      if (user.role && !currentSchool) {
        loadUserSchools(user).catch(() => {});
      }
      setLoading(false);
      return;
    }

    // Subscribe to Firebase auth state
    const unsubscribe = AuthService.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      
      // Set/clear auth cookie for middleware (server-side route protection)
      if (firebaseUser) {
        document.cookie = `educonnect-token=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        await loadUserSchools(firebaseUser);
      } else {
        document.cookie = 'educonnect-token=; path=/; max-age=0';
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle redirects - only redirect to login if auth is checked and no user
  useEffect(() => {
    // If user exists and on login page, redirect based on role
    if (user && pathname === '/login') {
      if (user.role === 'SuperAdmin') {
        router.push('/superadmin');
      } else {
        router.push('/dashboard');
      }
      return;
    }
    
    // Only redirect to login if:
    // 1. Auth has been checked (Firebase responded)
    // 2. No user exists
    // 3. Not already on public pages
    const publicPaths = ['/login', '/forgot-password', '/pricing', '/test-bare', '/test-login'];
    const isPublicPage = publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'));
    
    if (authChecked && !user && !isPublicPage) {
      document.cookie = 'educonnect-token=; path=/; max-age=0';
      router.push('/login');
    }
  }, [user, pathname, router, authChecked]);

  return <>{children}</>;
}
