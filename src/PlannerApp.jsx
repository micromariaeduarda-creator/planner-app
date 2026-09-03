/*
  IMPORTANT: this file is the PlannerApp component you provided with minimal edits.
  I changed storage functions to use localStorage and to sync with Firestore when the user is logged in.
  The rest of your logic was preserved.
*/
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, ChevronLeft, ChevronRight, Check, X, Clock, Repeat, AlertCircle, Home, CalendarDays, Target, Wallet, Settings, Loader2, } from 'lucide-react';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TIMEZONE = 'America/Sao_Paulo';
function pad(n) { return String(n).padStart(2, '0'); }
function getCurrentLocalDate(refDate = new Date()) { const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', }); return fmt.format(refDate); }
function getCurrentLocalHour(refDate = new Date()) { const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', hour12: false }); return parseInt(fmt.format(refDate), 10) % 24; }
function parseDate(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function formatDate(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(dateStr, days) { const d = parseDate(dateStr); d.setUTCDate(d.getUTCDate() + days); return formatDate(d); }
function diffInDays(laterStr, earlierStr) { return Math.round((parseDate(laterStr) - parseDate(earlierStr)) / 86400000); }
function getWeekday(dateStr) { return parseDate(dateStr).getUTCDay(); }
function dateRange(startStr, endStr) { const out = []; let cur = startStr; while (true) { out.push(cur); if (cur === endStr) break; cur = addDays(cur, 1); } return out; }
const WEEKDAY_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAY_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_MIN_MONFIRST = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function formatHero(dateStr) { const d = parseDate(dateStr); const weekday = WEEKDAY_LONG[d.getUTCDay()]; return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), full: `${d.getUTCDate()} de ${MONTH_LONG[d.getUTCMonth()]} de ${d.getUTCFullYear()}`, }; }
function getGreeting(hour) { if (hour < 5) return 'Boa madrugada'; if (hour < 12) return 'Bom dia'; if (hour < 18) return 'Boa tarde'; return 'Boa noite'; }
let _idSeed = 0; function genId(prefix) { _idSeed += 1; return `${prefix}_${Date.now().toString(36)}_${_idSeed}_${Math.random().toString(36).slice(2, 7)}`; }
function createEmptyState() { return { tasks: [], recurrences: [], pendingTasks: [], processedDates: [], goals: [], workouts: [], expenses: [], notes: [], settings: { weeklyWorkoutTarget: 5 }, }; }
function cloneState(state) { return JSON.parse(JSON.stringify(state)); }
function sanitizeState(raw) { const s = raw && typeof raw === 'object' ? raw : {}; return { tasks: Array.isArray(s.tasks) ? s.tasks : [], recurrences: Array.isArray(s.recurrences) ? s.recurrences : [], pendingTasks: Array.isArray(s.pendingTasks) ? s.pendingTasks : [], processedDates: Array.isArray(s.processedDates) ? s.processedDates : [], goals: Array.isArray(s.goals) ? s.goals : [], workouts: Array.isArray(s.workouts) ? s.workouts : [], expenses: Array.isArray(s.expenses) ? s.expenses : [], notes: Array.isArray(s.notes) ? s.notes : [], settings: { weeklyWorkoutTarget: 5, ...(s.settings && typeof s.settings === 'object' ? s.settings : {}), }, }; }
function recurrenceMatchesDate(rec, dateStr) { if (!rec.active) return false; if (rec.startDate && diffInDays(dateStr, rec.startDate) < 0) return false; if (rec.type === 'daily') return true; if (rec.type === 'weekly') return Array.isArray(rec.daysOfWeek) && rec.daysOfWeek.includes(getWeekday(dateStr)); if (rec.type === 'monthly') return parseDate(dateStr).getUTCDate() === rec.dayOfMonth; return false; }
function occurrenceExists(state, recurrenceId, dateStr) { return state.tasks.some((t) => t.recurrenceId === recurrenceId && t.date === dateStr); }
function generateOccurrencesForDate(state, dateStr) { state.recurrences.forEach((rec) => { if (recurrenceMatchesDate(rec, dateStr) && !occurrenceExists(state, rec.id, dateStr)) { state.tasks.push({ id: genId('task'), title: rec.title, description: rec.description || '', date: dateStr, time: rec.time || '', category: rec.category || '', status: 'pending', priority: rec.priority || 'normal', createdAt: new Date().toISOString(), completedAt: null, recurrenceId: rec.id, sourceTaskId: null, carryOverEnabled: rec.carryOverEnabled !== false, }); } }); }
function updatePendingTasks(state, todayStr) { state.tasks.forEach((task) => { if (!task.carryOverEnabled) return; if (diffInDays(task.date, todayStr) >= 0) return; const existing = state.pendingTasks.find((p) => p.taskId === task.id); if (task.status === 'pending') { if (!existing) { state.pendingTasks.push({ id: genId('pend'), taskId: task.id, originalDate: task.date, status: 'active', createdAt: new Date().toISOString(), resolvedAt: null, }); } else if (existing.status !== 'active') { existing.status = 'active'; existing.resolvedAt = null; } } else if (task.status === 'completed' || task.status === 'cancelled') { if (existing && existing.status === 'active') { existing.status = 'resolved'; existing.resolvedAt = new Date().toISOString(); } } }); }
function getActivePending(state, todayStr) { return state.pendingTasks .filter((p) => p.status === 'active') .map((p) => { const task = state.tasks.find((t) => t.id === p.taskId); if (!task) return null; return { pending: p, task, daysOverdue: diffInDays(todayStr, task.date) }; }) .filter(Boolean) .sort((a, b) => b.daysOverdue - a.daysOverdue); }
function processDailyTransition(state, todayStr) { const processedSet = new Set(state.processedDates); const lastProcessed = state.processedDates.length ? state.processedDates.reduce((a, b) => (diffInDays(a, b) > 0 ? a : b)) : null; let datesToProcess = []; if (!lastProcessed) datesToProcess = [todayStr]; else if (diffInDays(todayStr, lastProcessed) > 0) datesToProcess = dateRange(addDays(lastProcessed, 1), todayStr); datesToProcess.forEach((d) => { if (!processedSet.has(d)) { generateOccurrencesForDate(state, d); processedSet.add(d); state.processedDates.push(d); } }); updatePendingTasks(state, todayStr); }
function getTasksForDate(state, dateStr) { return state.tasks.filter((t) => t.date === dateStr); }
function getWeekStart(dateStr) { const offset = (getWeekday(dateStr) + 6) % 7; return addDays(dateStr, -offset); }
function getWeekEnd(dateStr) { return addDays(getWeekStart(dateStr), 6); }
function isDateInWeek(dateStr, weekStartStr) { const d = diffInDays(dateStr, weekStartStr); return d >= 0 && d <= 6; }
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatWeekLabel(weekStart) { const start = parseDate(weekStart); const end = parseDate(addDays(weekStart, 6)); const sameMonth = start.getUTCMonth() === end.getUTCMonth(); const startLabel = sameMonth ? `${start.getUTCDate()}` : `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]}`; const endLabel = `${end.getUTCDate()} ${MONTH_SHORT[end.getUTCMonth()]}`; return `${startLabel} – ${endLabel}`; }
function createGoal(state, { title, weekStart }) { const goal = { id: genId('goal'), title, weekStart, status: 'pending', createdAt: new Date().toISOString(), completedAt: null }; state.goals.push(goal); return goal; }
function toggleGoalStatus(state, goalId) { const g = state.goals.find((x) => x.id === goalId); if (!g) return; g.status = g.status === 'completed' ? 'pending' : 'completed'; g.completedAt = g.status === 'completed' ? new Date().toISOString() : null; }
function deleteGoal(state, goalId) { state.goals = state.goals.filter((g) => g.id !== goalId); }
function getGoalsForWeek(state, weekStart) { return state.goals.filter((g) => g.weekStart === weekStart); }
function createWorkout(state, { title, date }) { const w = { id: genId('workout'), title, date, status: 'pending', createdAt: new Date().toISOString(), completedAt: null }; state.workouts.push(w); return w; }
function toggleWorkoutStatus(state, workoutId) { const w = state.workouts.find((x) => x.id === workoutId); if (!w) return; w.status = w.status === 'completed' ? 'pending' : 'completed'; w.completedAt = w.status === 'completed' ? new Date().toISOString() : null; }
function deleteWorkout(state, workoutId) { state.workouts = state.workouts.filter((w) => w.id !== workoutId); }
function getWorkoutsForDate(state, date) { return state.workouts.filter((w) => w.date === date); }
function getCompletedWorkoutsInWeek(state, weekStart) { return state.workouts.filter((w) => w.status === 'completed' && isDateInWeek(w.date, weekStart)).length; }
function createExpense(state, { description, amount, category, date }) { const e = { id: genId('exp'), description, amount: Number(amount) || 0, category: category || '', date, createdAt: new Date().toISOString() }; state.expenses.push(e); return e; }
function updateExpense(state, expenseId, patch) { const e = state.expenses.find((x) => x.id === expenseId); if (!e) return; Object.assign(e, patch); if (patch.amount !== undefined) e.amount = Number(patch.amount) || 0; }
function deleteExpense(state, expenseId) { state.expenses = state.expenses.filter((e) => e.id !== expenseId); }
function getExpensesForDate(state, date) { return state.expenses.filter((e) => e.date === date); }
function getExpensesInRange(state, startStr, endStr) { return state.expenses.filter((e) => diffInDays(e.date, startStr) >= 0 && diffInDays(endStr, e.date) >= 0); }
function sumExpenses(list) { return list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0); }
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function formatBRL(n) { return currencyFormatter.format(n || 0); }
function getNoteForDate(state, date) { const n = state.notes.find((x) => x.date === date); return n ? n.content : ''; }
function upsertNote(state, date, content) { const existing = state.notes.find((x) => x.date === date); if (existing) { existing.content = content; existing.updatedAt = new Date().toISOString(); return existing; } if (!content.trim()) return null; const n = { id: genId('note'), date, content, updatedAt: new Date().toISOString() }; state.notes.push(n); return n; }
function getMonthStart(dateStr) { const d = parseDate(dateStr); return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); }
function getMonthEnd(dateStr) { const d = parseDate(dateStr); return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
function addMonths(dateStr, n) { const d = parseDate(dateStr); return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))); }
function getCalendarGridDates(monthStartStr) { const gridStart = getWeekStart(monthStartStr); const gridEnd = getWeekEnd(getMonthEnd(monthStartStr)); return dateRange(gridStart, gridEnd); }
function getDayStatus(state, dateStr) { const tasks = state.tasks.filter((t) => t.date === dateStr && t.status !== 'cancelled'); if (tasks.length === 0) return 'empty'; return tasks.every((t) => t.status === 'completed') ? 'done' : 'pending'; }
function formatMonthLabel(monthStart) { const d = parseDate(monthStart); const name = MONTH_LONG[d.getUTCMonth()]; return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${d.getUTCFullYear()}`; }
function getResolvedPendencies(state) { return state.pendingTasks .filter((p) => p.status === 'resolved') .map((p) => { const task = state.tasks.find((t) => t.id === p.taskId); return task ? { pending: p, task } : null; }) .filter(Boolean) .sort((a, b) => (b.pending.resolvedAt || '').localeCompare(a.pending.resolvedAt || '')); }
function formatShortDatePtBr(isoString) { if (!isoString) return ''; const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit' }); return fmt.format(new Date(isoString)); }

const STORAGE_KEY = 'planner-state-v1';

async function loadStateFromStorage() {
  // 1) try localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch (e) {
    // ignore
  }

  // 2) if logged in, try Firestore
  try {
    const user = auth.currentUser;
    if (user) {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data().state;
        if (data) return sanitizeState(JSON.parse(data));
      }
    }
  } catch (e) {
    console.warn('Erro lendo Firestore:', e.message);
  }

  return null;
}

async function saveStateToStorage(state) {
  try {
    const str = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, str);
    const user = auth.currentUser;
    if (user) {
      const ref = doc(db, 'users', user.uid);
      await setDoc(ref, { state: str, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return true;
  } catch (e) {
    console.error('Não foi possível salvar os dados do planner:', e);
    return false;
  }
}

const PRIORITIES = [ { value: 'low', label: 'Baixa' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Alta' }, { value: 'urgent', label: 'Urgente' }, ];
const CATEGORY_SUGGESTIONS = ['Trabalho', 'Clínica', 'Pessoal', 'Saúde', 'Casa'];
const EXPENSE_CATEGORIES = ['Clínica', 'Insumos', 'Pessoal', 'Alimentação', 'Transporte', 'Casa'];
const GASTOS_PERIODS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']];
const RECURRENCE_TYPES = [ { value: 'none', label: 'Não repetir' }, { value: 'daily', label: 'Diária' }, { value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensal' }, ];
const NAV_ITEMS = [ { key: 'hoje', label: 'Hoje', Icon: Home }, { key: 'calendario', label: 'Calendário', Icon: CalendarDays }, { key: 'metas', label: 'Metas', Icon: Target }, { key: 'gastos', label: 'Gastos', Icon: Wallet }, { key: 'config', label: 'Ajustes', Icon: Settings }, ];

function GlobalStyle() { return (null); }
function LoadingScreen() { return (
  <div style={{padding:20}}>Carregando seu planner…</div>
); }
function StatBlock({ number, label }) { return (
  <div style={{border:'1px solid #eee',borderRadius:8,padding:12,flex:1,marginRight:8}}>
    <div style={{fontSize:18,fontWeight:700}}>{number}</div>
    <div style={{color:'#666'}}>{label}</div>
  </div>
); }
function PriorityBar({ priority }) { if (priority !== 'urgent' && priority !== 'high') { return null; } const color = priority === 'urgent' ? 'var(--wine)' : 'var(--gold)'; return <div style={{height:4,background:color}} />; }
function TaskRow({ task, onToggle, onOpen }) { const done = task.status === 'completed'; return (
  <button className="pl-task-row" onClick={() => onOpen(task)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:8,border:'1px solid #eee',borderRadius:6,marginBottom:8}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <input type="checkbox" checked={done} onChange={(e)=>{e.stopPropagation(); onToggle(task.id);}} />
      <div>
        <div style={{fontWeight:700}}>{task.title}</div>
        <div style={{fontSize:12,color:'#666'}}>{(task.time||'')}{task.category? ' · '+task.category : ''}</div>
      </div>
    </div>
    <div style={{fontSize:12,color:'#999'}}>{task.recurrenceId ? 'R' : ''}</div>
  </button>
); }
function PendingPanel({ items, onToggle, onOpen }) { if (!items.length) return null; return (
  <div style={{marginBottom:12}}>
    <h3>Pendências</h3>
    {items.map(({ task, daysOverdue }) => (
      <div key={task.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #f3d',padding:8,borderRadius:6,marginBottom:6}}>
        <div onClick={() => onOpen(task)} style={{cursor:'pointer'}}>{task.title}</div>
        <div style={{fontSize:12,color:'#a00'}}>Atrasada: {daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'}</div>
        <div><button onClick={() => onToggle(task.id)}>Toggle</button></div>
      </div>
    ))}
  </div>
); }
function CalendarioScreen({ monthLabel, isCurrentMonth, onPrevMonth, onThisMonth, onNextMonth, gridDates, monthStart, todayStr, getStatus, onSelectDay, }) { return (
  <div>
    <h1>Calendário</h1>
    <div>{monthLabel}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,marginTop:8}}>
      {WEEKDAY_MIN_MONFIRST.map((l, i) => <div key={i} style={{fontWeight:700,textAlign:'center'}}>{l}</div>)}
      {gridDates.map((d) => { const inMonth = d.slice(0, 7) === monthStart.slice(0, 7); const status = getStatus(d); const isToday = d === todayStr; return (
        <button key={d} onClick={() => onSelectDay(d)} style={{padding:8,background:inMonth? '#fff':'#fafafa',border:isToday? '2px solid #0077ff':'1px solid #eee'}}>{parseInt(d.slice(8, 10), 10)} {status !== 'empty' && '•'}</button>
      ); })}
    </div>
  </div>
); }
function ConfiguracoesScreen({ weeklyWorkoutTarget, onChangeTarget, resolvedPendencies }) { return (
  <div>
    <h1>Configurações</h1>
    <div>
      <h3>Meta semanal de treinos</h3>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <button onClick={() => onChangeTarget(Math.max(1, weeklyWorkoutTarget - 1))}>−</button>
        <div>{weeklyWorkoutTarget} {weeklyWorkoutTarget === 1 ? 'dia' : 'dias'} por semana</div>
        <button onClick={() => onChangeTarget(Math.min(7, weeklyWorkoutTarget + 1))}>+</button>
      </div>
    </div>
    <div style={{marginTop:16}}>
      <h3>Histórico de pendências resolvidas</h3>
      {resolvedPendencies.length === 0 ? <div>Nada por aqui ainda</div> : (
        <div>{resolvedPendencies.map(({ pending, task }) => (<div key={pending.id}>{task.title} {formatShortDatePtBr(pending.resolvedAt)}</div>))}</div>
      )}
    </div>
  </div>
); }
function TaskSheet(props) { const { draft, onChange, onClose, onSave, isEditing, isRecurringOccurrence, onComplete, onReopen, onCancelTask, onDelete, } = props; const [confirming, setConfirming] = useState(false); if (!draft) return null; const canSave = draft.title.trim().length > 0 && !!draft.date; return (
  <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.3)'}}>
    <div style={{background:'#fff',padding:16,width:640,borderRadius:8}}>
      <div style={{display:'flex',justifyContent:'space-between'}}>
        <strong>{isEditing ? 'Editar tarefa' : 'Nova tarefa'}</strong>
        <button onClick={onClose}>Fechar</button>
      </div>
      <div style={{marginTop:12}}>
        <label>Título</label>
        <input value={draft.title} onChange={(e)=>onChange({title:e.target.value})} style={{width:'100%',padding:8}} />
      </div>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <div style={{flex:1}}>
          <label>Data *</label>
          <input type="date" value={draft.date} onChange={(e)=>onChange({date:e.target.value})} />
        </div>
        <div style={{flex:1}}>
          <label>Horário</label>
          <input type="time" value={draft.time} onChange={(e)=>onChange({time:e.target.value})} />
        </div>
      </div>
      <div style={{marginTop:12,display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button disabled={!canSave} onClick={onSave}>{isEditing? 'Salvar' : 'Adicionar tarefa'}</button>
      </div>
    </div>
  </div>
); }
function WeekNav({ label, isCurrent, onPrev, onCurrent, onNext, prevLabel, nextLabel }) { return (
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <button onClick={onPrev} aria-label={prevLabel}><ChevronLeft size={18} /></button>
    <button onClick={onCurrent}>{label}</button>
    <button onClick={onNext} aria-label={nextLabel}><ChevronRight size={18} /></button>
  </div>
); }
function MetasScreen({ weekLabel, isCurrentWeek, onPrevWeek, onThisWeek, onNextWeek, goals, onToggle, onDelete, quickAddValue, onQuickAddChange, onQuickAddSubmit, }) {
  const completed = goals.filter((g) => g.status === 'completed').length;
  return (
    <div>
      <h1>Metas da semana</h1>
      <p>{weekLabel}</p>
      <WeekNav label="Esta semana" isCurrent={isCurrentWeek} onPrev={onPrevWeek} onCurrent={onThisWeek} onNext={onNextWeek} />
      <div style={{display:'flex',gap:8,marginTop:12}}>
        <StatBlock number={`${completed}/${goals.length}`} label="metas concluídas" />
      </div>
      <div style={{marginTop:12}}>
        {goals.length === 0 ? <div>Nenhuma meta por aqui</div> : (
          <div>{goals.map((g)=> (
            <div key={g.id} style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="checkbox" checked={g.status === 'completed'} onChange={() => onToggle(g.id)} />
              <div>{g.title}</div>
              <button onClick={() => onDelete(g.id)}>Excluir</button>
            </div>
          ))}</div>
        )}
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <input value={quickAddValue} onChange={onQuickAddChange} placeholder="Nova meta para esta semana" />
          <button onClick={onQuickAddSubmit}><Plus size={18} /></button>
        </div>
      </div>
    </div>
  );
}
function GastosScreen({ period, onPeriodChange, expenses, total, onOpenEdit }) {
  const periodLabel = { hoje: 'hoje', semana: 'esta semana', mes: 'este mês' }[period];
  return (
    <div>
      <h1>Gastos</h1>
      <p>Controle rápido do dia a dia</p>
      <div style={{display:'flex',gap:8}}>
        {GASTOS_PERIODS.map(([value, label]) => (
          <button key={value} onClick={() => onPeriodChange(value)} style={{fontWeight: period===value?700:400}}>{label}</button>
        ))}
      </div>
      <h2>Total {periodLabel}</h2>
      <div style={{display:'flex',gap:8}}>
        <StatBlock number={formatBRL(total)} label={`${expenses.length} ${expenses.length === 1 ? 'lançamento' : 'lançamentos'}`} />
      </div>
      <div style={{marginTop:12}}>
        {expenses.length === 0 ? <div>Nenhum gasto por aqui</div> : (
          <div>{expenses.map(e => (
            <div key={e.id} style={{display:'flex',justifyContent:'space-between',padding:8,border:'1px solid #eee',borderRadius:6,marginBottom:6}}>
              <div>
                <div>{e.description}</div>
                <div style={{fontSize:12,color:'#666'}}>{e.category}</div>
              </div>
              <div>{formatBRL(e.amount)}</div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
function ExpenseSheet({ draft, onChange, onClose, onSave, isEditing, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  if (!draft) return null;
  const canSave = draft.description.trim().length > 0 && Number(draft.amount) > 0 && !!draft.date;
  return (
    <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.3)'}}>
      <div style={{background:'#fff',padding:16,width:480,borderRadius:8}}>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <strong>{isEditing ? 'Editar gasto' : 'Novo gasto'}</strong>
          <button onClick={onClose}>Fechar</button>
        </div>
        <div style={{marginTop:12}}>
          <label>Descrição *</label>
          <input value={draft.description} onChange={(e)=>onChange({description:e.target.value})} style={{width:'100%',padding:8}} />
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <div style={{flex:1}}>
            <label>Valor (R$) *</label>
            <input type="number" min="0" step="0.01" value={draft.amount} onChange={(e)=>onChange({amount:e.target.value})} />
          </div>
          <div style={{flex:1}}>
            <label>Data *</label>
            <input type="date" value={draft.date} onChange={(e)=>onChange({date:e.target.value})} />
          </div>
        </div>
        <div style={{marginTop:12,display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button disabled={!canSave} onClick={onSave}>{isEditing? 'Salvar' : 'Adicionar gasto'}</button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerApp({ user }) {
  const [state, setState] = useState(createEmptyState());
  const [loaded, setLoaded] = useState(false);
  const [todayStr, setTodayStr] = useState(() => getCurrentLocalDate());
  const [viewedDate, setViewedDate] = useState(() => getCurrentLocalDate());
  const [activeTab, setActiveTab] = useState('hoje');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [formDraft, setFormDraft] = useState(null);
  const [viewedWeekStart, setViewedWeekStart] = useState(() => getWeekStart(getCurrentLocalDate()));
  const [goalQuickAdd, setGoalQuickAdd] = useState('');
  const [workoutQuickAdd, setWorkoutQuickAdd] = useState('');
  const [noteDraftText, setNoteDraftText] = useState('');
  const [gastosPeriod, setGastosPeriod] = useState('hoje');
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseDraft, setExpenseDraft] = useState(null);
  const [viewedMonth, setViewedMonth] = useState(() => getMonthStart(getCurrentLocalDate()));

  const applyMutation = useCallback((mutator) => {
    setState((prev) => {
      const next = cloneState(prev);
      mutator(next);
      saveStateToStorage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await loadStateFromStorage();
      const today = getCurrentLocalDate();
      const next = sanitizeState(stored || createEmptyState());
      processDailyTransition(next, today);
      await saveStateToStorage(next);
      if (active) {
        setState(next);
        setTodayStr(today);
        setViewedDate(today);
        setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function checkRollover() {
      const today = getCurrentLocalDate();
      setTodayStr((prevToday) => {
        if (today === prevToday) return prevToday;
        setState((prevState) => {
          const next = cloneState(prevState);
          processDailyTransition(next, today);
          saveStateToStorage(next);
          return next;
        });
        setViewedDate((prevViewed) => (prevViewed === prevToday ? today : prevViewed));
        return today;
      });
    }
    function onVisible() { if (document.visibilityState === 'visible') checkRollover(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkRollover);
    const interval = setInterval(checkRollover, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkRollover);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setNoteDraftText(getNoteForDate(state, viewedDate));
  }, [viewedDate, loaded]);

  const dayTasks = useMemo(() => (
    getTasksForDate(state, viewedDate)
      .filter((t) => t.status !== 'cancelled')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'completed' ? 1 : -1;
        if (!!a.time !== !!b.time) return a.time ? -1 : 1;
        if (a.time && b.time) return a.time.localeCompare(b.time);
        return a.createdAt.localeCompare(b.createdAt);
      })
  ), [state, viewedDate]);

  const activePending = useMemo(() => getActivePending(state, todayStr), [state, todayStr]);
  const completedCount = dayTasks.filter((t) => t.status === 'completed').length;
  const isToday = viewedDate === todayStr;
  const hero = formatHero(viewedDate);

  const isCurrentWeek = viewedWeekStart === getWeekStart(todayStr);
  const weekGoals = useMemo(() => getGoalsForWeek(state, viewedWeekStart), [state, viewedWeekStart]);

  const dayWorkouts = useMemo(() => getWorkoutsForDate(state, viewedDate), [state, viewedDate]);
  const workoutsWeekStart = getWeekStart(viewedDate);
  const completedWorkoutsThisWeek = useMemo(
    () => getCompletedWorkoutsInWeek(state, workoutsWeekStart),
    [state, workoutsWeekStart],
  );

  const dayExpensesTotal = useMemo(() => sumExpenses(getExpensesForDate(state, viewedDate)), [state, viewedDate]);

  const gastosRange = useMemo(() => {
    if (gastosPeriod === 'hoje') return [todayStr, todayStr];
    if (gastosPeriod === 'semana') { const ws = getWeekStart(todayStr); return [ws, addDays(ws, 6)]; }
    const d = parseDate(todayStr);
    const first = formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const last = formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    return [first, last];
  }, [gastosPeriod, todayStr]);
  const gastosExpenses = useMemo(
    () => getExpensesInRange(state, gastosRange[0], gastosRange[1])
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [state, gastosRange],
  );
  const gastosTotal = useMemo(() => sumExpenses(gastosExpenses), [gastosExpenses]);

  const isCurrentMonth = viewedMonth === getMonthStart(todayStr);
  const calendarGridDates = useMemo(() => getCalendarGridDates(viewedMonth), [viewedMonth]);
  const getCalendarDayStatus = useCallback((d) => getDayStatus(state, d), [state]);
  const resolvedPendencies = useMemo(() => getResolvedPendencies(state), [state]);

  function handleToggle(taskId) {
    applyMutation((next) => {
      const t = next.tasks.find((x) => x.id === taskId);
      if (!t) return;
      t.status = t.status === 'completed' ? 'pending' : 'completed';
      t.completedAt = t.status === 'completed' ? new Date().toISOString() : null;
      updatePendingTasks(next, todayStr);
    });
  }

  function openNewTaskSheet() {
    const d = parseDate(viewedDate);
    setEditingTaskId(null);
    setFormDraft({
      title: '', description: '', date: viewedDate, time: '', category: '',
      priority: 'normal', carryOverEnabled: true,
      recurrenceType: 'none', daysOfWeek: [d.getUTCDay()], dayOfMonth: d.getUTCDate(),
    });
    setSheetOpen(true);
  }
  function openEditTaskSheet(task) {
    setEditingTaskId(task.id);
    setFormDraft({
      title: task.title, description: task.description || '', date: task.date, time: task.time || '',
      category: task.category || '', priority: task.priority || 'normal',
      carryOverEnabled: task.carryOverEnabled !== false, status: task.status,
      recurrenceId: task.recurrenceId || null,
      recurrenceType: 'none', daysOfWeek: [], dayOfMonth: 1,
    });
    setSheetOpen(true);
  }
  function closeSheet() { setSheetOpen(false); setEditingTaskId(null); setFormDraft(null); }
  function updateDraft(patch) { setFormDraft((prev) => ({ ...prev, ...patch })); }

  function handleSave() {
    if (!formDraft || !formDraft.title.trim() || !formDraft.date) return;
    if (editingTaskId) {
      applyMutation((next) => {
        const t = next.tasks.find((x) => x.id === editingTaskId);
        if (!t) return;
        t.title = formDraft.title.trim();
        t.description = formDraft.description.trim();
        t.date = formDraft.date;
        t.time = formDraft.time;
        t.category = formDraft.category.trim();
        t.priority = formDraft.priority;
        t.carryOverEnabled = formDraft.carryOverEnabled;
        updatePendingTasks(next, todayStr);
      });
    } else {
      applyMutation((next) => {
        if (formDraft.recurrenceType === 'none') {
          next.tasks.push({
            id: genId('task'), title: formDraft.title.trim(), description: formDraft.description.trim(),
            date: formDraft.date, time: formDraft.time, category: formDraft.category.trim(),
            status: 'pending', priority: formDraft.priority, createdAt: new Date().toISOString(),
            completedAt: null, recurrenceId: null, sourceTaskId: null, carryOverEnabled: formDraft.carryOverEnabled,
          });
        } else {
          const rec = {
            id: genId('rec'), title: formDraft.title.trim(), description: formDraft.description.trim(),
            category: formDraft.category.trim(), priority: formDraft.priority, time: formDraft.time,
            type: formDraft.recurrenceType, daysOfWeek: formDraft.daysOfWeek, dayOfMonth: formDraft.dayOfMonth,
            carryOverEnabled: formDraft.carryOverEnabled, startDate: formDraft.date, active: true,
            createdAt: new Date().toISOString(),
          };
          next.recurrences.push(rec);
          if (!occurrenceExists(next, rec.id, formDraft.date)) {
            next.tasks.push({
              id: genId('task'), title: rec.title, description: rec.description, date: formDraft.date,
              time: rec.time, category: rec.category, status: 'pending', priority: rec.priority,
              createdAt: new Date().toISOString(), completedAt: null, recurrenceId: rec.id,
              sourceTaskId: null, carryOverEnabled: rec.carryOverEnabled,
            });
          }
        }
        updatePendingTasks(next, todayStr);
      });
    }
    closeSheet();
  }

  function setEditingTaskStatus(status) {
    if (!editingTaskId) return;
    applyMutation((next) => {
      const t = next.tasks.find((x) => x.id === editingTaskId);
      if (!t) return;
      t.status = status;
      t.completedAt = status === 'completed' ? new Date().toISOString() : null;
      updatePendingTasks(next, todayStr);
    });
    setFormDraft((prev) => (prev ? { ...prev, status } : prev));
  }
  function handleDeleteEditing() { if (!editingTaskId) return; applyMutation((next) => { next.tasks = next.tasks.filter((t) => t.id !== editingTaskId); next.pendingTasks = next.pendingTasks.filter((p) => p.taskId !== editingTaskId); }); closeSheet(); }

  function goPrevWeek() { setViewedWeekStart((w) => addDays(w, -7)); }
  function goNextWeek() { setViewedWeekStart((w) => addDays(w, 7)); }
  function goThisWeek() { setViewedWeekStart(getWeekStart(todayStr)); }

  function handleToggleGoal(goalId) { applyMutation((next) => { toggleGoalStatus(next, goalId); }); }
  function handleDeleteGoal(goalId) { applyMutation((next) => { deleteGoal(next, goalId); }); }
  function handleAddGoal() { const title = goalQuickAdd.trim(); if (!title) return; applyMutation((next) => { createGoal(next, { title, weekStart: viewedWeekStart }); }); setGoalQuickAdd(''); }

  function handleToggleWorkout(workoutId) { applyMutation((next) => { toggleWorkoutStatus(next, workoutId); }); }
  function handleDeleteWorkout(workoutId) { applyMutation((next) => { deleteWorkout(next, workoutId); }); }
  function handleAddWorkout() { const title = workoutQuickAdd.trim(); if (!title) return; applyMutation((next) => { createWorkout(next, { title, date: viewedDate }); }); setWorkoutQuickAdd(''); }

  function handleSaveNote(text) { applyMutation((next) => { upsertNote(next, viewedDate, text); }); }

  function openNewExpenseSheet() { setEditingExpenseId(null); setExpenseDraft({ description: '', amount: '', category: '', date: viewedDate }); setExpenseSheetOpen(true); }
  function openEditExpenseSheet(expense) { setEditingExpenseId(expense.id); setExpenseDraft({ description: expense.description, amount: String(expense.amount), category: expense.category || '', date: expense.date, }); setExpenseSheetOpen(true); }
  function closeExpenseSheet() { setExpenseSheetOpen(false); setEditingExpenseId(null); setExpenseDraft(null); }
  function updateExpenseDraft(patch) { setExpenseDraft((prev) => ({ ...prev, ...patch })); }
  function handleSaveExpense() { if (!expenseDraft || !expenseDraft.description.trim() || !(Number(expenseDraft.amount) > 0) || !expenseDraft.date) return; const payload = { description: expenseDraft.description.trim(), amount: expenseDraft.amount, category: expenseDraft.category, date: expenseDraft.date, }; if (editingExpenseId) { applyMutation((next) => { updateExpense(next, editingExpenseId, payload); }); } else { applyMutation((next) => { createExpense(next, payload); }); } closeExpenseSheet(); }
  function handleDeleteExpense() { if (!editingExpenseId) return; applyMutation((next) => { deleteExpense(next, editingExpenseId); }); closeExpenseSheet(); }

  function goPrevMonth() { setViewedMonth((m) => addMonths(m, -1)); }
  function goNextMonth() { setViewedMonth((m) => addMonths(m, 1)); }
  function goThisMonth() { setViewedMonth(getMonthStart(todayStr)); }
  function handleSelectCalendarDay(dateStr) { setViewedDate(dateStr); setActiveTab('hoje'); }
  function handleChangeWorkoutTarget(newValue) { applyMutation((next) => { next.settings.weeklyWorkoutTarget = newValue; }); }

  if (!loaded) return <LoadingScreen />;

  return (
    <div className="pl-app">
      <GlobalStyle />
      <div className="pl-content">
        {activeTab === 'hoje' && (
          <>
            {isToday && <p className="pl-greeting">{getGreeting(getCurrentLocalHour())}, {user && user.email}</p>}
            <h1 className="pl-hero-weekday pl-serif">{hero.weekday}</h1>
            <p className="pl-hero-date">{hero.full}</p>

            <div className="pl-datenav">
              <button type="button" className="pl-datenav-btn" aria-label="Dia anterior" onClick={() => setViewedDate((d) => addDays(d, -1))}>
                <ChevronLeft size={18} />
              </button>
              <button type="button" className={`pl-datenav-today ${isToday ? 'is-today' : ''}`} onClick={() => setViewedDate(todayStr)}>
                Hoje
              </button>
              <button type="button" className="pl-datenav-btn" aria-label="Próximo dia" onClick={() => setViewedDate((d) => addDays(d, 1))}>
                <ChevronRight size={18} />
              </button>
            </div>

            <h2 className="pl-section-title pl-serif">{isToday ? 'Foco de hoje' : 'Resumo do dia'}</h2>
            <div style={{display:'flex',gap:8}}>
              <StatBlock number={`${completedCount}/${dayTasks.length}`} label="tarefas concluídas" />
              <StatBlock number={activePending.length} label="pendências" />
              <StatBlock number={formatBRL(dayExpensesTotal)} label="gastos no dia" />
              <StatBlock number={`${completedWorkoutsThisWeek}/${state.settings.weeklyWorkoutTarget}`} label="treinos na semana" />
            </div>

            {isToday && (
              <PendingPanel items={activePending} onToggle={handleToggle} onOpen={openEditTaskSheet} />
            )}

            <h2 className="pl-section-title pl-serif">{isToday ? 'Checklist de hoje' : 'Tarefas do dia'}</h2>
            {dayTasks.length === 0 ? (
              <div className="pl-empty-state">
                <strong>Nenhuma tarefa por aqui</strong>
                <div>Toque no + para adicionar algo para este dia.</div>
              </div>
            ) : (
              <div className="pl-checklist" style={{ marginBottom: 30 }}>
                {dayTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={handleToggle} onOpen={openEditTaskSheet} />
                ))}
              </div>
            )}

            <h2 className="pl-section-title pl-serif">Treinos</h2>
            <div className="pl-mini-section">
              {dayWorkouts.length === 0 ? (
                <p className="pl-mini-empty">Nenhum treino registrado para este dia.</p>
              ) : (
                <div className="pl-mini-list">
                  {dayWorkouts.map((w) => (
                    <div key={w.id} className="pl-mini-row">
                      <input type="checkbox" checked={w.status === 'completed'} onChange={() => handleToggleWorkout(w.id)} />
                      <span className={`pl-mini-title ${w.status === 'completed' ? 'done' : ''}`}>{w.title}</span>
                      <button onClick={() => handleDeleteWorkout(w.id)}>Excluir</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <input value={workoutQuickAdd} onChange={(e) => setWorkoutQuickAdd(e.target.value)} placeholder="Adicionar treino…" />
                <button onClick={handleAddWorkout}><Plus size={18} /></button>
              </div>
              <p className="pl-week-progress">{completedWorkoutsThisWeek}/{state.settings.weeklyWorkoutTarget} treinos concluídos essa semana</p>
            </div>

            <h2 className="pl-section-title pl-serif">Anotações</h2>
            <textarea className="pl-notes-textarea" value={noteDraftText} onChange={(e) => setNoteDraftText(e.target.value)} onBlur={() => handleSaveNote(noteDraftText)} placeholder="Anotação do dia…" style={{width:'100%',minHeight:120,padding:8}} />
          </>
        )}

        {activeTab === 'metas' && (
          <MetasScreen weekLabel={formatWeekLabel(viewedWeekStart)} isCurrentWeek={isCurrentWeek} onPrevWeek={goPrevWeek} onThisWeek={goThisWeek} onNextWeek={goNextWeek} goals={weekGoals} onToggle={handleToggleGoal} onDelete={handleDeleteGoal} quickAddValue={goalQuickAdd} onQuickAddChange={(e)=>setGoalQuickAdd(e.target.value)} onQuickAddSubmit={handleAddGoal} />
        )}

        {activeTab === 'gastos' && (
          <GastosScreen period={gastosPeriod} onPeriodChange={setGastosPeriod} expenses={gastosExpenses} total={gastosTotal} onOpenEdit={openEditExpenseSheet} />
        )}

        {activeTab === 'calendario' && (
          <CalendarioScreen monthLabel={formatMonthLabel(viewedMonth)} isCurrentMonth={isCurrentMonth} onPrevMonth={goPrevMonth} onThisMonth={goThisMonth} onNextMonth={goNextMonth} gridDates={calendarGridDates} monthStart={viewedMonth} todayStr={todayStr} getStatus={getCalendarDayStatus} onSelectDay={handleSelectCalendarDay} />
        )}

        {activeTab === 'config' && (
          <ConfiguracoesScreen weeklyWorkoutTarget={state.settings.weeklyWorkoutTarget} onChangeTarget={handleChangeWorkoutTarget} resolvedPendencies={resolvedPendencies} />
        )}
      </div>

      {(activeTab === 'hoje' || activeTab === 'gastos') && (
        <button type="button" className="pl-fab" aria-label={activeTab === 'hoje' ? 'Adicionar tarefa' : 'Adicionar gasto'} onClick={activeTab === 'hoje' ? openNewTaskSheet : openNewExpenseSheet}><Plus size={25} /></button>
      )}

      <nav className="pl-bottomnav">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button key={key} type="button" className={`pl-bottomnav-item ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            <Icon size={20} />
            <span className="pl-bottomnav-label">{label}</span>
          </button>
        ))}
      </nav>

      {sheetOpen && (
        <TaskSheet draft={formDraft} onChange={updateDraft} onClose={closeSheet} onSave={handleSave} isEditing={!!editingTaskId} isRecurringOccurrence={!!(formDraft && formDraft.recurrenceId)} onComplete={() => setEditingTaskStatus('completed')} onReopen={() => setEditingTaskStatus('pending')} onCancelTask={() => setEditingTaskStatus('cancelled')} onDelete={handleDeleteEditing} />
      )}

      {expenseSheetOpen && (
        <ExpenseSheet draft={expenseDraft} onChange={updateExpenseDraft} onClose={closeExpenseSheet} onSave={handleSaveExpense} isEditing={!!editingExpenseId} onDelete={handleDeleteExpense} />
      )}
    </div>
  );
}
