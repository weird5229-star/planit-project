import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, TrendingUp, Calendar, CreditCard, Search, Plus, Edit2, Trash2, X, Download, Home, FileText, Menu, Bell, LogOut, Eye, EyeOff } from 'lucide-react';

// Firebase imports
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';

// 전화번호 포맷팅 함수
const formatPhoneNumber = (value) => {
  // 숫자만 추출
  const numbers = value.replace(/[^\d]/g, '');
  
  // 최대 11자리까지만
  const limited = numbers.slice(0, 11);
  
  // 포맷팅
  if (limited.length <= 3) {
    return limited;
  } else if (limited.length <= 7) {
    return `${limited.slice(0, 3)}-${limited.slice(3)}`;
  } else {
    return `${limited.slice(0, 3)}-${limited.slice(3, 7)}-${limited.slice(7)}`;
  }
};

// 카테고리 옵션
const categories = ['수술', '피부시술', '상담', '관리'];
const visitSources = ['인터넷', '외부 소개', '지인 소개', '기존', '회원권'];
const paymentMethods = ['카드', '계좌이체', '현금'];
const paymentStatuses = ['완납', '예약금', '잔금', '환불'];

// 시술 목록 (카테고리별)
const proceduresByCategory = {
  '수술': ['눈매교정', '코성형', '안면윤곽', '지방흡입', '가슴성형', '눈밑지방재배치', '이마거상', '안면거상'],
  '피부시술': ['보톡스', '필러', '레이저토닝', '울쎄라', '써마지', '스킨부스터', 'PRP', '물광주사'],
  '상담': ['눈성형상담', '코성형상담', '윤곽상담', '피부상담', '체형상담', '종합상담'],
  '관리': ['리프팅관리', '재생관리', '미백관리', '모공관리', '여드름관리', '탄력관리']
};

// 통계 계산 함수 (환불 자동 차감 적용)
const calculateStats = (customers, period = 'day') => {
  const today = new Date();
  const filtered = customers.filter(c => {
    const date = new Date(c.date);
    if (period === 'day') {
      return date.toDateString() === today.toDateString();
    } else if (period === 'week') {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
    } else if (period === 'month') {
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    }
    return true;
  });
  
  // 환불이 아닌 건만 총 매출에 포함
  const totalRevenue = filtered
    .filter(c => c.paymentStatus !== '환불')
    .reduce((sum, c) => sum + (c.amount > 0 ? c.amount : 0), 0);
  
  // 환불 금액 계산 (환불 상태인 건의 금액)
  const totalRefund = filtered
    .filter(c => c.paymentStatus === '환불')
    .reduce((sum, c) => sum + Math.abs(c.amount || 0), 0);
  
  const customerCount = filtered.filter(c => c.paymentStatus !== '환불').length;
  const consultCount = filtered.filter(c => c.category === '상담' && c.paymentStatus !== '환불').length;
  
  return { 
    totalRevenue, 
    totalRefund, 
    customerCount, 
    consultCount, 
    netRevenue: totalRevenue - totalRefund 
  };
};

// 카테고리별 매출 계산 (0인 카테고리 제외)
const getCategoryRevenue = (customers) => {
  const categoryData = {};
  categories.forEach(cat => {
    categoryData[cat] = customers
      .filter(c => c.category === cat && c.amount > 0 && c.paymentStatus !== '환불')
      .reduce((sum, c) => sum + c.amount, 0);
  });
  // 0인 카테고리 제외
  return Object.entries(categoryData)
    .filter(([name, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
};

// 일별 매출 데이터 (최근 7일)
const getDailyRevenue = (customers) => {
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayRevenue = customers
      .filter(c => c.date === dateStr && c.amount > 0 && c.paymentStatus !== '환불')
      .reduce((sum, c) => sum + c.amount, 0);
    data.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      매출: dayRevenue
    });
  }
  return data;
};

// 내원경로별 통계 (0인 항목 제외)
const getSourceStats = (customers) => {
  const sourceData = {};
  visitSources.forEach(source => {
    sourceData[source] = customers.filter(c => c.visitSource === source && c.paymentStatus !== '환불').length;
  });
  return Object.entries(sourceData)
    .filter(([name, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
};

// 뉴트럴 색상 팔레트
const COLORS = ['#64748b', '#78716c', '#71717a', '#6b7280', '#737373'];

// 로그인 컴포넌트
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('등록되지 않은 이메일입니다.');
      } else if (err.code === 'auth/wrong-password') {
        setError('비밀번호가 올바르지 않습니다.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다.');
      } else if (err.code === 'auth/weak-password') {
        setError('비밀번호는 6자 이상이어야 합니다.');
      } else if (err.code === 'auth/invalid-email') {
        setError('올바른 이메일 형식이 아닙니다.');
      } else {
        setError('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50 to-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-600 to-gray-600 mb-4 shadow-lg shadow-slate-200">
            <span className="text-3xl font-bold text-white">P</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">
            Planit
          </h1>
          <p className="text-slate-500 mt-2">성형외과 통합 관리 시스템</p>
        </div>

        {/* 로그인 폼 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200 p-8 shadow-xl shadow-slate-100">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">
            {isSignUp ? '새 계정 만들기' : '로그인'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">이메일</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-slate-600 to-gray-600 text-white rounded-xl font-medium hover:from-slate-700 hover:to-gray-700 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
            >
              {loading ? '처리 중...' : (isSignUp ? '계정 만들기' : '로그인')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 메인 앱 컴포넌트
export default function PlanitAdmin() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statsPeriod, setStatsPeriod] = useState('month');
  const [dataLoading, setDataLoading] = useState(true);

  // 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore 실시간 데이터 구독
  useEffect(() => {
    if (!user) return;

    setDataLoading(true);
    const customersRef = collection(db, 'customers');
    const q = query(customersRef, orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCustomers(customersData);
      setDataLoading(false);
    }, (error) => {
      console.error('Firestore error:', error);
      setDataLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 고객 추가
  const handleAddCustomer = async (customerData) => {
    try {
      await addDoc(collection(db, 'customers'), {
        ...customerData,
        createdAt: serverTimestamp(),
        createdBy: user.email
      });
      setShowModal(false);
    } catch (error) {
      console.error('Error adding customer:', error);
      alert('고객 등록에 실패했습니다.');
    }
  };

  // 고객 수정
  const handleUpdateCustomer = async (customerData) => {
    try {
      const customerRef = doc(db, 'customers', customerData.id);
      await updateDoc(customerRef, {
        ...customerData,
        updatedAt: serverTimestamp(),
        updatedBy: user.email
      });
      setShowModal(false);
      setEditingCustomer(null);
    } catch (error) {
      console.error('Error updating customer:', error);
      alert('고객 정보 수정에 실패했습니다.');
    }
  };

  // 고객 저장 (추가 또는 수정)
  const handleSaveCustomer = (customerData) => {
    if (customerData.id) {
      handleUpdateCustomer(customerData);
    } else {
      handleAddCustomer(customerData);
    }
  };

  // 고객 삭제
  const handleDeleteCustomer = async (id) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'customers', id));
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('고객 삭제에 실패했습니다.');
      }
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // 필터링된 고객 목록
  const filteredCustomers = customers.filter(c => {
    const matchSearch = c.name?.includes(searchTerm) || c.phone?.includes(searchTerm) || c.procedure?.includes(searchTerm);
    const matchCategory = !filterCategory || c.category === filterCategory;
    const matchStatus = !filterStatus || c.paymentStatus === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  // CSV 내보내기
  const exportCSV = () => {
    const headers = ['이름', '연락처', '대분류', '시술명', '내원경로', '결제수단', '납부상태', '금액', '날짜', '메모'];
    const rows = filteredCustomers.map(c => [
      c.name, c.phone, c.category, c.procedure, c.visitSource, c.paymentMethod, c.paymentStatus, c.amount, c.date, c.memo
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Planit_고객데이터_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // 로딩 중
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50 to-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 로그인 안됨
  if (!user) {
    return <LoginPage />;
  }

  const stats = calculateStats(customers, statsPeriod);
  const categoryRevenue = getCategoryRevenue(customers);
  const dailyRevenue = getDailyRevenue(customers);
  const sourceStats = getSourceStats(customers);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50 to-zinc-100 text-slate-800 flex">
      {/* 사이드바 */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white/90 backdrop-blur-sm border-r border-slate-200 transition-all duration-300 flex flex-col shadow-lg`}>
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-gray-600 flex items-center justify-center shadow-md">
              <span className="text-lg font-bold text-white">P</span>
            </div>
            {sidebarOpen && <span className="font-semibold text-lg tracking-tight text-slate-800">Planit</span>}
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'dashboard', icon: Home, label: '대시보드' },
            { id: 'customers', icon: Users, label: '고객 관리' },
            { id: 'records', icon: FileText, label: '시술 기록' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                  ? 'bg-gradient-to-r from-slate-600 to-gray-600 text-white shadow-md shadow-slate-200' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* 사용자 정보 & 로그아웃 */}
        <div className="p-4 border-t border-slate-100 space-y-2">
          {sidebarOpen && (
            <div className="px-4 py-2 text-sm text-slate-500 truncate">
              {user.email}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={18} />
            {sidebarOpen && <span>로그아웃</span>}
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
      </aside>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 overflow-auto">
        {/* 헤더 */}
        <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl border-b border-slate-100 px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {activeTab === 'dashboard' && '대시보드'}
                {activeTab === 'customers' && '고객 관리'}
                {activeTab === 'records' && '시술 기록'}
              </h1>
              <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors relative">
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-slate-500 rounded-full"></span>
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-gray-600 flex items-center justify-center font-medium text-white shadow-md">
                {user.email?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* 데이터 로딩 */}
          {dataLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500">데이터 불러오는 중...</p>
              </div>
            </div>
          ) : (
            <>
              {/* 대시보드 */}
              {activeTab === 'dashboard' && (
                <div className="space-y-8">
                  {/* 기간 선택 */}
                  <div className="flex gap-2">
                    {[
                      { id: 'day', label: '오늘' },
                      { id: 'week', label: '이번 주' },
                      { id: 'month', label: '이번 달' },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setStatsPeriod(p.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          statsPeriod === p.id
                            ? 'bg-gradient-to-r from-slate-600 to-gray-600 text-white shadow-md'
                            : 'bg-white/70 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* 통계 카드 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={TrendingUp} label="총 매출" value={`₩${stats.totalRevenue.toLocaleString()}`} color="slate" />
                    <StatCard icon={CreditCard} label="순 매출" value={`₩${stats.netRevenue.toLocaleString()}`} color="gray" />
                    <StatCard icon={Users} label="내원 고객" value={`${stats.customerCount}명`} color="zinc" />
                    <StatCard icon={Calendar} label="상담 건수" value={`${stats.consultCount}건`} color="stone" />
                  </div>

                  {/* 차트 영역 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 일별 매출 추이 */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700">일별 매출 추이</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={dailyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                          <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${(v/10000).toFixed(0)}만`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                            labelStyle={{ color: '#475569' }}
                            formatter={(value) => [`₩${value.toLocaleString()}`, '매출']}
                          />
                          <Line type="monotone" dataKey="매출" stroke="#64748b" strokeWidth={3} dot={{ fill: '#64748b', strokeWidth: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 카테고리별 매출 */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700">카테고리별 매출</h3>
                      {categoryRevenue.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <PieChart>
                            <Pie
                              data={categoryRevenue}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={{ stroke: '#94a3b8' }}
                            >
                              {categoryRevenue.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                              formatter={(value) => [`₩${value.toLocaleString()}`, '매출']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[280px] text-slate-400">
                          데이터가 없습니다
                        </div>
                      )}
                    </div>

                    {/* 내원경로 분석 */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700">내원경로 분석</h3>
                      {sourceStats.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={sourceStats} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" stroke="#64748b" fontSize={12} />
                            <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={12} width={80} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                              formatter={(value) => [`${value}명`, '고객 수']}
                            />
                            <Bar dataKey="value" fill="#64748b" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[280px] text-slate-400">
                          데이터가 없습니다
                        </div>
                      )}
                    </div>

                    {/* 최근 고객 */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700">최근 고객</h3>
                      <div className="space-y-3">
                        {customers.slice(0, 5).map(customer => (
                          <div key={customer.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-gray-400 flex items-center justify-center text-white font-medium">
                                {customer.name?.[0]}
                              </div>
                              <div>
                                <p className="font-medium text-slate-700">{customer.name}</p>
                                <p className="text-sm text-slate-400">{customer.procedure}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-slate-700">₩{customer.amount?.toLocaleString()}</p>
                              <p className="text-sm text-slate-400">{customer.date}</p>
                            </div>
                          </div>
                        ))}
                        {customers.length === 0 && (
                          <p className="text-center text-slate-400 py-8">등록된 고객이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 고객 관리 */}
              {activeTab === 'customers' && (
                <div className="space-y-6">
                  {/* 툴바 */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        placeholder="이름, 연락처, 시술명 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
                      />
                    </div>
                    
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-slate-400 transition-colors"
                    >
                      <option value="">전체 카테고리</option>
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-slate-400 transition-colors"
                    >
                      <option value="">전체 납부상태</option>
                      {paymentStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>

                    <button
                      onClick={exportCSV}
                      className="flex items-center gap-2 px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                    >
                      <Download size={18} />
                      <span>내보내기</span>
                    </button>

                    <button
                      onClick={() => { setEditingCustomer(null); setShowModal(true); }}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-600 to-gray-600 rounded-xl text-white font-medium hover:from-slate-700 hover:to-gray-700 transition-all shadow-lg shadow-slate-200"
                    >
                      <Plus size={18} />
                      <span>새 고객</span>
                    </button>
                  </div>

                  {/* 고객 테이블 */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50">
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">고객명</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">연락처</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">대분류</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">시술명</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">내원경로</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">결제</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">납부상태</th>
                            <th className="text-right px-6 py-4 text-sm font-medium text-slate-500">금액</th>
                            <th className="text-center px-6 py-4 text-sm font-medium text-slate-500">날짜</th>
                            <th className="text-center px-6 py-4 text-sm font-medium text-slate-500">관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCustomers.map(customer => (
                            <tr key={customer.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-gray-400 flex items-center justify-center text-white text-sm font-medium">
                                    {customer.name?.[0]}
                                  </div>
                                  <span className="font-medium text-slate-700">{customer.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-slate-600">{customer.phone}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                  customer.category === '수술' ? 'bg-slate-200 text-slate-700' :
                                  customer.category === '피부시술' ? 'bg-gray-200 text-gray-700' :
                                  customer.category === '상담' ? 'bg-zinc-200 text-zinc-700' :
                                  'bg-stone-200 text-stone-700'
                                }`}>
                                  {customer.category}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-600">{customer.procedure}</td>
                              <td className="px-6 py-4 text-slate-500">{customer.visitSource}</td>
                              <td className="px-6 py-4 text-slate-500">{customer.paymentMethod || '-'}</td>
                              <td className="px-6 py-4">
                                {customer.paymentStatus && (
                                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                    customer.paymentStatus === '완납' ? 'bg-emerald-100 text-emerald-700' :
                                    customer.paymentStatus === '예약금' ? 'bg-amber-100 text-amber-700' :
                                    customer.paymentStatus === '잔금' ? 'bg-orange-100 text-orange-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {customer.paymentStatus}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right font-medium text-slate-700">
                                {customer.amount !== 0 ? `₩${customer.amount?.toLocaleString()}` : '-'}
                              </td>
                              <td className="px-6 py-4 text-center text-slate-500">{customer.date}</td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => { setEditingCustomer(customer); setShowModal(true); }}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCustomer(customer.id)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {filteredCustomers.length === 0 && (
                      <div className="text-center py-12 text-slate-400">
                        {customers.length === 0 ? '등록된 고객이 없습니다. 새 고객을 등록해주세요.' : '검색 결과가 없습니다.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 시술 기록 */}
              {activeTab === 'records' && (
                <div className="space-y-6">
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                    <h3 className="text-lg font-semibold mb-6 text-slate-700">시술 카테고리별 통계</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {categories.map(cat => {
                        const catCustomers = customers.filter(c => c.category === cat && c.paymentStatus !== '환불');
                        const catRevenue = catCustomers.reduce((sum, c) => sum + (c.amount > 0 ? c.amount : 0), 0);
                        return (
                          <div key={cat} className="bg-slate-50/50 rounded-xl p-4">
                            <h4 className="font-medium text-slate-600 mb-2">{cat}</h4>
                            <p className="text-2xl font-bold text-slate-800 mb-1">₩{catRevenue.toLocaleString()}</p>
                            <p className="text-sm text-slate-400">{catCustomers.length}건</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                    <h3 className="text-lg font-semibold mb-6 text-slate-700">시술별 상세 현황</h3>
                    <div className="space-y-4">
                      {categories.map(cat => (
                        <div key={cat} className="space-y-2">
                          <h4 className="font-medium text-slate-600">{cat}</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {proceduresByCategory[cat].map(proc => {
                              const count = customers.filter(c => c.procedure === proc && c.paymentStatus !== '환불').length;
                              return (
                                <div key={proc} className="flex items-center justify-between px-3 py-2 bg-slate-50/50 rounded-lg">
                                  <span className="text-sm text-slate-600">{proc}</span>
                                  <span className="text-sm font-medium text-slate-700">{count}건</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 고객 추가/수정 모달 */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onSave={handleSaveCustomer}
          onClose={() => { setShowModal(false); setEditingCustomer(null); }}
        />
      )}
    </div>
  );
}

// 통계 카드 컴포넌트
function StatCard({ icon: Icon, label, value, color }) {
  const colorClasses = {
    slate: 'from-slate-100 to-slate-50 border-slate-200 text-slate-600',
    gray: 'from-gray-100 to-gray-50 border-gray-200 text-gray-600',
    zinc: 'from-zinc-100 to-zinc-50 border-zinc-200 text-zinc-600',
    stone: 'from-stone-100 to-stone-50 border-stone-200 text-stone-600',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-2xl p-6 shadow-lg`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-white/70`}>
          <Icon size={20} />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

// 고객 모달 컴포넌트
function CustomerModal({ customer, onSave, onClose }) {
  const [form, setForm] = useState(customer || {
    name: '',
    phone: '',
    category: '수술',
    procedure: '',
    visitSource: '인터넷',
    paymentMethod: '카드',
    paymentStatus: '완납',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });

  // 전화번호 입력 핸들러
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setForm({ ...form, phone: formatted });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, amount: parseInt(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">
            {customer ? '고객 정보 수정' : '새 고객 등록'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">고객명 *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">연락처 *</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={handlePhoneChange}
                placeholder="010-0000-0000"
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">대분류 *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, procedure: '' })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">시술명 *</label>
              <select
                value={form.procedure}
                onChange={(e) => setForm({ ...form, procedure: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              >
                <option value="">선택하세요</option>
                {proceduresByCategory[form.category]?.map(proc => (
                  <option key={proc} value={proc}>{proc}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">내원경로</label>
              <select
                value={form.visitSource}
                onChange={(e) => setForm({ ...form, visitSource: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              >
                {visitSources.map(src => <option key={src} value={src}>{src}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">결제수단</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              >
                <option value="">선택하세요</option>
                {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">납부상태</label>
              <select
                value={form.paymentStatus}
                onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              >
                <option value="">선택하세요</option>
                {paymentStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">금액</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">날짜</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">메모</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-gradient-to-r from-slate-600 to-gray-600 text-white rounded-xl hover:from-slate-700 hover:to-gray-700 transition-all font-medium shadow-lg shadow-slate-200"
            >
              {customer ? '수정하기' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
