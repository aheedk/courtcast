import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { queryKeys } from './lib/queryClient';
import { TopBar } from './components/TopBar';
import { AuthGate } from './components/AuthGate';
import { MapPage } from './routes/MapPage';
import { MyCourtsPage } from './routes/MyCourtsPage';
import { LoginPage } from './routes/LoginPage';

export function App() {
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if ((err as { status?: number }).status === 401) return { user: null };
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const user = me.data?.user ?? null;

  return (
    <BrowserRouter>
      <TopBar user={user} />
      <Routes>
        <Route path="/" element={<MapPage user={user} />} />
        <Route path="/login" element={<LoginPage user={user} />} />
        <Route
          path="/my-courts"
          element={
            <AuthGate user={user}>
              <MyCourtsPage user={user!} />
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
