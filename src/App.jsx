import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import PlannerApp from './PlannerApp';
import Login from './Login';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) return <div style={{padding:20}}>Carregando…</div>;

  return (
    <div>
      {user ? (
        <div>
          <div style={{position:'fixed',right:12,top:12,zIndex:40}}>
            <button onClick={() => signOut(auth)}>Sair</button>
          </div>
          <PlannerApp user={user} />
        </div>
      ) : (
        <Login />
      )}
    </div>
  );
}
