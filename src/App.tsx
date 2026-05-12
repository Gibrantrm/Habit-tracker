import React, { useState, useEffect } from 'react';
import { Check, Plus, Calendar, Trophy, ChevronLeft, ChevronRight, Settings, LogOut, Github, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Habit {
  id: string;
  name: string;
  completedDates: string[]; // "YYYY-MM-DD" formatted
  createdAt: number;
}

const getTodayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getRelativeDateString = (dateContext: Date) => {
  const d = new Date(dateContext);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [activeTab, setActiveTab] = useState<'today' | 'stats'>('today');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Materializar el documento del usuario para que sea visible en la consola
        const userRef = doc(db, 'users', u.uid);
        try {
          await setDoc(userRef, {
            displayName: u.displayName,
            email: u.email,
            lastSeen: Date.now()
          }, { merge: true });
        } catch (e) {
          console.error("Error syncing profile:", e);
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setHabits([]);
      return;
    }

    const habitsPath = `users/${user.uid}/habits`;
    const q = query(collection(db, habitsPath), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const habitsData: Habit[] = [];
      snapshot.forEach((doc) => {
        habitsData.push({ id: doc.id, ...doc.data() } as Habit);
      });
      setHabits(habitsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, habitsPath);
    });

    return () => unsubscribe();
  }, [user]);

  const dateString = getRelativeDateString(currentDate);
  const todayString = getTodayString();
  const isToday = dateString === todayString;

  const toggleHabit = async (id: string) => {
    const habit = habits.find(h => h.id === id);
    if (!habit || !user) return;

    const path = `users/${user.uid}/habits/${id}`;
    const isCompleted = habit.completedDates.includes(dateString);
    const newCompletedDates = isCompleted 
      ? habit.completedDates.filter(d => d !== dateString)
      : [...habit.completedDates, dateString];

    try {
      await updateDoc(doc(db, path), {
        completedDates: newCompletedDates
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitName.trim() || !user) return;
    
    const path = `users/${user.uid}/habits`;
    const newHabit = {
      name: newHabitName.trim(),
      completedDates: [],
      createdAt: Date.now()
    };

    try {
      await addDoc(collection(db, path), newHabit);
      setNewHabitName('');
      setIsAddingMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteHabit = async (id: string) => {
    if (!user || !confirm('¿Estás seguro de que quieres eliminar este hábito?')) return;
    const path = `users/${user.uid}/habits/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const prevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const nextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const getDayName = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const formatted = formatter.format(date);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center items-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Habit Tracker</h1>
          <p className="text-slate-500 mb-8">Empieza a trackear tus hábitos diarios hoy mismo.</p>
          
          <button 
            onClick={() => loginWithGoogle()}
            className="w-full bg-white border-2 border-slate-200 hover:border-indigo-500 text-slate-700 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 group"
          >
            <Github className="w-6 h-6 group-hover:text-black transition-colors" />
            Ingresar con Google
          </button>
          
          <p className="mt-8 text-xs text-slate-400">
            Al ingresar, tus hábitos se guardarán en la nube de forma segura.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-md bg-white shadow-xl min-h-screen flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <header className="px-6 pt-10 pb-4 bg-indigo-600 text-white rounded-b-[2rem] shadow-md z-10 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-indigo-400">
                {user.photoURL ? (
                   <img src={user.photoURL} alt={user.displayName || 'User'} referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-full h-full p-2 bg-indigo-500" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Hola, {user.displayName?.split(' ')[0]}</h1>
                <p className="text-indigo-200 text-xs font-medium">¡Vamos por un buen día!</p>
              </div>
            </div>
            <button 
              onClick={() => logout()}
              className="p-2 bg-indigo-500/30 rounded-full hover:bg-indigo-500/50 transition"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex justify-between items-center bg-indigo-700/50 rounded-2xl p-2 backdrop-blur-sm">
            <button onClick={prevDay} className="p-2 text-indigo-100 hover:text-white hover:bg-indigo-600 rounded-xl transition">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold">{isToday ? "Hoy, " : ""}{getDayName(currentDate)}</p>
            </div>
            <button onClick={nextDay} disabled={isToday} className={`p-2 rounded-xl transition ${isToday ? 'opacity-50 text-indigo-300' : 'text-indigo-100 hover:text-white hover:bg-indigo-600'}`}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 pb-32">
          {activeTab === 'today' && (
            <AnimatePresence mode="popLayout">
              {habits.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center text-center mt-20 text-slate-400"
                >
                  <Trophy className="w-16 h-16 mb-4 text-slate-200" />
                  <p className="text-lg font-medium text-slate-600">Aún no tienes hábitos</p>
                  <p className="text-sm mt-1">Añade uno para empezar a trackear tu progreso.</p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {habits.map(habit => {
                    const isCompleted = habit.completedDates.includes(dateString);
                    return (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={habit.id}
                        className={`group p-4 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                          isCompleted ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 'bg-white border-slate-100 shadow-sm hover:border-slate-200'
                        }`}
                        onClick={() => toggleHabit(habit.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isCompleted ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 text-transparent'
                          }`}>
                            <Check className="w-5 h-5 flex-shrink-0" strokeWidth={3} />
                          </div>
                          <span className={`font-medium transition-colors ${isCompleted ? 'text-indigo-900 line-through opacity-70' : 'text-slate-700'}`}>
                            {habit.name}
                          </span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); }}
                          className="text-xs text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                        >
                          Eliminar
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-800">Tus Hábitos</h2>
              <div className="grid gap-4">
                {habits.map(habit => (
                  <div key={habit.id} className="bg-white border border-slate-100 shadow-sm p-5 rounded-2xl">
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="font-semibold text-slate-800">{habit.name}</h3>
                       <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold">
                         {habit.completedDates.length} completados
                       </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                       <div 
                        className="bg-indigo-500 h-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, (habit.completedDates.length / 30) * 100)}%` }} 
                       />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">Progreso mensual estimado</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Add Button */}
        {activeTab === 'today' && (
          <div className="absolute bottom-24 right-6">
            <button 
              onClick={() => setIsAddingMode(true)}
              className="w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center"
            >
              <Plus className="w-8 h-8" />
            </button>
          </div>
        )}

        {/* Add Habit Modal Overlay */}
        <AnimatePresence>
          {isAddingMode && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
                onClick={() => setIsAddingMode(false)}
              />
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl pt-8 pb-12 px-6 z-50 shadow-2xl"
              >
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 absolute top-4 left-1/2 -translate-x-1/2" />
                <h3 className="text-2xl font-bold text-slate-800 mb-6">Nuevo Hábito</h3>
                <form onSubmit={addHabit}>
                  <input
                    type="text"
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    placeholder="Ej. Leer 10 páginas, Beber agua..."
                    autoFocus
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors mb-6"
                  />
                  <button 
                    type="submit" 
                    disabled={!newHabitName.trim()}
                    className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition active:scale-[0.98]"
                  >
                    Guardar Hábito
                  </button>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around p-4 pb-6 z-30">
          <button 
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'today' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Calendar className="w-6 h-6" />
            <span className="text-[10px] font-semibold">Hoy</span>
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'stats' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Trophy className="w-6 h-6" />
            <span className="text-[10px] font-semibold">Progreso</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
