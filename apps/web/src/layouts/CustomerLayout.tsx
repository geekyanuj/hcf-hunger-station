import { Outlet } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

export function CustomerLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 pb-20 sm:pb-0">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
