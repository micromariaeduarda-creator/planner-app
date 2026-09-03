import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{padding:20,maxWidth:420,margin:'40px auto',border:'1px solid #eee',borderRadius:8}}>
      <h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
      <form onSubmit={submit}>
        <div style={{marginBottom:8}}>
          <input placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} style={{width:'100%',padding:8}} required />
        </div>
        <div style={{marginBottom:8}}>
          <input placeholder="Senha" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} style={{width:'100%',padding:8}} required />
        </div>
        {err && <div style={{color:'crimson',marginBottom:8}}>{err}</div>}
        <div style={{display:'flex',gap:8}}>
          <button type="submit" disabled={loading}>{mode === 'login' ? 'Entrar' : 'Criar'}</button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Já tenho conta'}</button>
        </div>
      </form>
      <p style={{marginTop:12,fontSize:12,color:'#666'}}>As credenciais são apenas para login; seus dados do planner serão salvos no Firestore do seu projeto Firebase após autenticação.</p>
    </div>
  );
}
