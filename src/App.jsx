import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, TrendingUp, Calendar, CreditCard, Search, Plus, Edit2, Trash2, X, Download, Home, FileText, Menu, Bell, LogOut, Eye, EyeOff, Camera, Clock, ChevronLeft, ChevronRight, Image, Megaphone, UserPlus, Star, User, Crown } from 'lucide-react';

// Firebase imports
import { auth, db, storage } from './firebase';
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
  serverTimestamp,
  setDoc,
  getDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

// 전화번호 포맷팅 함수
const formatPhoneNumber = (value) => {
  const numbers = value.replace(/[^\d]/g, '');
  const limited = numbers.slice(0, 11);
  
  if (limited.length <= 3) {
    return limited;
  } else if (limited.length <= 7) {
    return `${limited.slice(0, 3)}-${limited.slice(3)}`;
  } else {
    return `${limited.slice(0, 3)}-${limited.slice(3, 7)}-${limited.slice(7)}`;
  }
};

// 시간 포맷팅
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString('ko-KR');
};

// 카테고리 옵션
const categories = ['수술', '피부시술', '상담', '관리'];
const visitSources = ['인터넷', '외부 소개', '지인 소개', '기존', '회원권'];
const paymentMethods = ['카드', '계좌이체', '현금'];
const paymentStatuses = ['완납', '예약금', '잔금', '환불'];
const customerGrades = ['일반', 'VIP', 'VVIP'];
const staffPositions = ['사원', '팀장', '실장', '이사', '원장'];

// 예약 시간 옵션 (09:00 ~ 22:00)
const timeSlots = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00'
];

// 시술 목록
const proceduresByCategory = {
  '수술': ['눈매교정', '코성형', '안면윤곽', '지방흡입', '가슴성형', '눈밑지방재배치', '이마거상', '안면거상'],
  '피부시술': ['보톡스', '필러', '레이저토닝', '울쎄라', '써마지', '스킨부스터', 'PRP', '물광주사'],
  '상담': ['눈성형상담', '코성형상담', '윤곽상담', '피부상담', '체형상담', '종합상담'],
  '관리': ['리프팅관리', '재생관리', '미백관리', '모공관리', '여드름관리', '탄력관리']
};

// 통계 계산 함수
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
  
  const totalRevenue = filtered
    .filter(c => c.paymentStatus !== '환불')
    .reduce((sum, c) => sum + (c.amount > 0 ? c.amount : 0), 0);
  
  const totalRefund = filtered
    .filter(c => c.paymentStatus === '환불')
    .reduce((sum, c) => sum + Math.abs(c.amount || 0), 0);
  
  const customerCount = filtered.filter(c => c.paymentStatus !== '환불').length;
  const consultCount = filtered.filter(c => c.category === '상담' && c.paymentStatus !== '환불').length;
  
  return { totalRevenue, totalRefund, customerCount, consultCount, netRevenue: totalRevenue - totalRefund };
};

const getCategoryRevenue = (customers) => {
  const categoryData = {};
  categories.forEach(cat => {
    categoryData[cat] = customers
      .filter(c => c.category === cat && c.amount > 0 && c.paymentStatus !== '환불')
      .reduce((sum, c) => sum + c.amount, 0);
  });
  return Object.entries(categoryData)
    .filter(([name, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
};

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

const getSourceStats = (customers) => {
  const sourceData = {};
  visitSources.forEach(source => {
    sourceData[source] = customers.filter(c => c.visitSource === source && c.paymentStatus !== '환불').length;
  });
  return Object.entries(sourceData)
    .filter(([name, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
};

const COLORS = ['#64748b', '#78716c', '#71717a', '#6b7280', '#737373'];

// 로그인 컴포넌트
function LoginPage() {
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-600 to-gray-600 mb-4 shadow-lg shadow-slate-200">
            <span className="text-3xl font-bold text-white">P</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Planit</h1>
          <p className="text-slate-500 mt-2">성형외과 통합 관리 시스템</p>
        </div>

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
  const [userProfile, setUserProfile] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statsPeriod, setStatsPeriod] = useState('month');
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const notificationRef = useRef(null);

  // 클릭 외부 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 사용자 프로필 로드
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      try {
        const profileRef = doc(db, 'profiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setUserProfile(profileSnap.data());
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
  }, [user]);

  // 직원 목록 구독
  useEffect(() => {
    if (!user) return;

    const profilesRef = collection(db, 'profiles');
    const unsubscribe = onSnapshot(profilesRef, (snapshot) => {
      const profiles = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStaffList(profiles);
    });

    return () => unsubscribe();
  }, [user]);

  // 고객 데이터 구독
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

  // 공지사항 구독
  useEffect(() => {
    if (!user) return;

    const announcementsRef = collection(db, 'announcements');
    const q = query(announcementsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const announcementsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAnnouncements(announcementsData);
    });

    return () => unsubscribe();
  }, [user]);

  // 알림 구독
  useEffect(() => {
    if (!user) return;

    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(notificationsData);
    });

    return () => unsubscribe();
  }, [user]);

  // 프로필 저장
  const handleSaveProfile = async (profileData) => {
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      await setDoc(profileRef, {
        ...profileData,
        email: user.email,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setUserProfile(profileData);
      setShowProfileModal(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('프로필 저장에 실패했습니다.');
    }
  };

  // 고객 추가
  const handleAddCustomer = async (customerData) => {
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...customerData,
        createdAt: serverTimestamp(),
        createdBy: user.email
      });

      await addDoc(collection(db, 'notifications'), {
        type: 'new_customer',
        title: '새 고객 등록',
        message: `${customerData.name}님이 등록되었습니다. (${customerData.procedure})`,
        customerId: docRef.id,
        customerName: customerData.name,
        customerGrade: customerData.grade,
        read: {},
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

  const handleSaveCustomer = (customerData) => {
    if (customerData.id) {
      handleUpdateCustomer(customerData);
    } else {
      handleAddCustomer(customerData);
    }
  };

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

  // 공지사항 추가
  const handleAddAnnouncement = async (announcementData) => {
    try {
      await addDoc(collection(db, 'announcements'), {
        ...announcementData,
        read: {},
        createdAt: serverTimestamp(),
        createdBy: user.email
      });

      await addDoc(collection(db, 'notifications'), {
        type: 'announcement',
        title: '새 공지사항',
        message: announcementData.title,
        read: {},
        createdAt: serverTimestamp(),
        createdBy: user.email
      });

      setShowAnnouncementModal(false);
    } catch (error) {
      console.error('Error adding announcement:', error);
      alert('공지사항 등록에 실패했습니다.');
    }
  };

  // 공지사항 수정
  const handleUpdateAnnouncement = async (announcementData) => {
    try {
      const announcementRef = doc(db, 'announcements', announcementData.id);
      await updateDoc(announcementRef, {
        title: announcementData.title,
        content: announcementData.content,
        important: announcementData.important,
        updatedAt: serverTimestamp(),
        updatedBy: user.email
      });
      setShowAnnouncementModal(false);
      setEditingAnnouncement(null);
    } catch (error) {
      console.error('Error updating announcement:', error);
      alert('공지사항 수정에 실패했습니다.');
    }
  };

  const handleSaveAnnouncement = (announcementData) => {
    if (announcementData.id) {
      handleUpdateAnnouncement(announcementData);
    } else {
      handleAddAnnouncement(announcementData);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'announcements', id));
      } catch (error) {
        console.error('Error deleting announcement:', error);
        alert('공지사항 삭제에 실패했습니다.');
      }
    }
  };

  // 알림 읽음 처리
  const markNotificationAsRead = async (notificationId) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        [`read.${user.uid}`]: true
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllNotificationsAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.read?.[user.uid]);
      for (const notification of unreadNotifications) {
        await markNotificationAsRead(notification.id);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.read?.[user.uid]).length;

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleViewDetail = (customer) => {
    setSelectedCustomer(customer);
    setShowDetailModal(true);
  };

  const filteredCustomers = customers.filter(c => {
    const matchSearch = c.name?.includes(searchTerm) || c.phone?.includes(searchTerm) || c.procedure?.includes(searchTerm);
    const matchCategory = !filterCategory || c.category === filterCategory;
    const matchStatus = !filterStatus || c.paymentStatus === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  const exportCSV = () => {
    const headers = ['이름', '연락처', '등급', '대분류', '시술명', '담당자', '내원경로', '결제수단', '납부상태', '금액', '날짜', '예약시간', '메모'];
    const rows = filteredCustomers.map(c => [
      c.name, c.phone, c.grade || '일반', c.category, c.procedure, c.staffName || '', c.visitSource, c.paymentMethod, c.paymentStatus, c.amount, c.date, c.appointmentTime || '', c.memo
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Planit_고객데이터_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getAppointmentsForDate = (date) => {
    return customers
      .filter(c => c.date === date && c.appointmentTime)
      .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime));
  };

  // 오늘 VIP/VVIP 예약 고객
  const getTodayVIPCustomers = () => {
    const today = new Date().toISOString().split('T')[0];
    return customers.filter(c => 
      c.date === today && 
      (c.grade === 'VIP' || c.grade === 'VVIP')
    ).sort((a, b) => (a.appointmentTime || '').localeCompare(b.appointmentTime || ''));
  };

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

  if (!user) {
    return <LoginPage />;
  }

  const stats = calculateStats(customers, statsPeriod);
  const categoryRevenue = getCategoryRevenue(customers);
  const dailyRevenue = getDailyRevenue(customers);
  const sourceStats = getSourceStats(customers);
  const todayVIPCustomers = getTodayVIPCustomers();

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
            { id: 'schedule', icon: Calendar, label: '예약 스케줄' },
            { id: 'announcements', icon: Megaphone, label: '공지사항' },
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
              {item.id === 'announcements' && announcements.filter(a => !a.read?.[user.uid]).length > 0 && (
                <span className="ml-auto w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                  {announcements.filter(a => !a.read?.[user.uid]).length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2">
          {sidebarOpen && (
            <div className="px-4 py-2 text-sm text-slate-500 truncate">
              {userProfile?.name || user.email}
              {userProfile?.position && (
                <span className="ml-1 text-xs text-slate-400">({userProfile.position})</span>
              )}
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
        <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl border-b border-slate-100 px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {activeTab === 'dashboard' && '대시보드'}
                {activeTab === 'customers' && '고객 관리'}
                {activeTab === 'schedule' && '예약 스케줄'}
                {activeTab === 'announcements' && '공지사항'}
                {activeTab === 'records' && '시술 기록'}
              </h1>
              <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            </div>
            <div className="flex items-center gap-4">
              {/* 알림 버튼 */}
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors relative"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* 알림 패널 */}
                {showNotificationPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">알림</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsAsRead}
                          className="text-sm text-slate-500 hover:text-slate-700"
                        >
                          모두 읽음
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          알림이 없습니다
                        </div>
                      ) : (
                        notifications.slice(0, 20).map(notification => (
                          <div
                            key={notification.id}
                            onClick={() => markNotificationAsRead(notification.id)}
                            className={`p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${
                              !notification.read?.[user.uid] ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg ${
                                notification.type === 'new_customer' 
                                  ? notification.customerGrade === 'VVIP' ? 'bg-amber-100 text-amber-600'
                                  : notification.customerGrade === 'VIP' ? 'bg-purple-100 text-purple-600'
                                  : 'bg-emerald-100 text-emerald-600'
                                  : 'bg-blue-100 text-blue-600'
                              }`}>
                                {notification.type === 'new_customer' ? <UserPlus size={16} /> : <Megaphone size={16} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-slate-700 text-sm">{notification.title}</p>
                                  {notification.customerGrade && notification.customerGrade !== '일반' && (
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                      notification.customerGrade === 'VVIP' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                      {notification.customerGrade}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-500 text-sm truncate">{notification.message}</p>
                                <p className="text-slate-400 text-xs mt-1">{formatTimeAgo(notification.createdAt)}</p>
                              </div>
                              {!notification.read?.[user.uid] && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 프로필 버튼 */}
              <button
                onClick={() => setShowProfileModal(true)}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-gray-600 flex items-center justify-center font-medium text-white shadow-md hover:from-slate-700 hover:to-gray-700 transition-all"
              >
                {userProfile?.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
              </button>
            </div>
          </div>
        </header>

        <div className="p-8">
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
                  {/* 중요 공지사항 배너 */}
                  {announcements.filter(a => a.important).length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <Megaphone className="text-amber-600" size={20} />
                        <div className="flex-1">
                          <p className="font-medium text-amber-800">
                            {announcements.filter(a => a.important)[0].title}
                          </p>
                          <p className="text-sm text-amber-600 line-clamp-1">
                            {announcements.filter(a => a.important)[0].content}
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab('announcements')}
                          className="text-sm text-amber-700 hover:underline"
                        >
                          자세히 보기
                        </button>
                      </div>
                    </div>
                  )}

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

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard icon={TrendingUp} label="총 매출" value={`₩${stats.totalRevenue.toLocaleString()}`} color="slate" />
                    <StatCard icon={Users} label="내원 고객" value={`${stats.customerCount}명`} color="zinc" />
                    <StatCard icon={Calendar} label="오늘 예약" value={`${getAppointmentsForDate(new Date().toISOString().split('T')[0]).length}건`} color="stone" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700">일별 매출 추이</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={dailyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                          <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${(v/10000).toFixed(0)}만`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                            formatter={(value) => [`₩${value.toLocaleString()}`, '매출']}
                          />
                          <Line type="monotone" dataKey="매출" stroke="#64748b" strokeWidth={3} dot={{ fill: '#64748b', strokeWidth: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* VIP/VVIP 고객 예약 */}
                    <div className="bg-gradient-to-br from-amber-50 to-purple-50 backdrop-blur-sm rounded-2xl border border-amber-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700 flex items-center gap-2">
                        <Crown className="text-amber-500" size={20} />
                        오늘의 VIP 고객
                      </h3>
                      <div className="space-y-2 max-h-[280px] overflow-y-auto">
                        {todayVIPCustomers.length > 0 ? (
                          todayVIPCustomers.map(customer => (
                            <div 
                              key={customer.id} 
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-all ${
                                customer.grade === 'VVIP' 
                                  ? 'bg-gradient-to-r from-amber-100 to-amber-50 border border-amber-200' 
                                  : 'bg-gradient-to-r from-purple-100 to-purple-50 border border-purple-200'
                              }`}
                              onClick={() => handleViewDetail(customer)}
                            >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                                customer.grade === 'VVIP' ? 'bg-amber-500' : 'bg-purple-500'
                              }`}>
                                {customer.grade === 'VVIP' ? <Crown size={18} /> : <Star size={18} />}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-slate-700">{customer.name}</p>
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                    customer.grade === 'VVIP' ? 'bg-amber-200 text-amber-800' : 'bg-purple-200 text-purple-800'
                                  }`}>
                                    {customer.grade}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-500">{customer.procedure}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-slate-600">{customer.appointmentTime || '-'}</p>
                                <p className="text-xs text-slate-400">{customer.staffName || '-'}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-slate-400">
                            <Crown className="mx-auto mb-2 opacity-30" size={32} />
                            <p>오늘 VIP 예약이 없습니다</p>
                          </div>
                        )}
                      </div>
                    </div>

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
                            <Tooltip formatter={(value) => [`₩${value.toLocaleString()}`, '매출']} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[280px] text-slate-400">데이터가 없습니다</div>
                      )}
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-6 shadow-lg">
                      <h3 className="text-lg font-semibold mb-6 text-slate-700">내원경로 분석</h3>
                      {sourceStats.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={sourceStats} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" stroke="#64748b" fontSize={12} />
                            <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={12} width={80} />
                            <Tooltip formatter={(value) => [`${value}명`, '고객 수']} />
                            <Bar dataKey="value" fill="#64748b" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[280px] text-slate-400">데이터가 없습니다</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 고객 관리 */}
              {activeTab === 'customers' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        placeholder="이름, 연락처, 시술명 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400 transition-all"
                      />
                    </div>
                    
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
                    >
                      <option value="">전체 카테고리</option>
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
                    >
                      <option value="">전체 납부상태</option>
                      {paymentStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>

                    <button
                      onClick={exportCSV}
                      className="flex items-center gap-2 px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <Download size={18} />
                      <span>내보내기</span>
                    </button>

                    <button
                      onClick={() => { setEditingCustomer(null); setShowModal(true); }}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-600 to-gray-600 rounded-xl text-white font-medium hover:from-slate-700 hover:to-gray-700 transition-all shadow-lg"
                    >
                      <Plus size={18} />
                      <span>새 고객</span>
                    </button>
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50">
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">고객명</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">등급</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">연락처</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">시술</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">담당</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">예약</th>
                            <th className="text-left px-6 py-4 text-sm font-medium text-slate-500">납부</th>
                            <th className="text-right px-6 py-4 text-sm font-medium text-slate-500">금액</th>
                            <th className="text-center px-6 py-4 text-sm font-medium text-slate-500">관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCustomers.map(customer => (
                            <tr key={customer.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleViewDetail(customer)}
                                  className="flex items-center gap-3 hover:text-slate-900"
                                >
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                                    customer.grade === 'VVIP' ? 'bg-amber-500' :
                                    customer.grade === 'VIP' ? 'bg-purple-500' :
                                    'bg-gradient-to-br from-slate-400 to-gray-400'
                                  }`}>
                                    {customer.grade === 'VVIP' ? <Crown size={14} /> :
                                     customer.grade === 'VIP' ? <Star size={14} /> :
                                     customer.name?.[0]}
                                  </div>
                                  <span className="font-medium text-slate-700 hover:underline">{customer.name}</span>
                                </button>
                              </td>
                              <td className="px-6 py-4">
                                {customer.grade && customer.grade !== '일반' && (
                                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                    customer.grade === 'VVIP' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                                  }`}>
                                    {customer.grade}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-slate-600">{customer.phone}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                  customer.category === '수술' ? 'bg-slate-200 text-slate-700' :
                                  customer.category === '피부시술' ? 'bg-gray-200 text-gray-700' :
                                  customer.category === '상담' ? 'bg-zinc-200 text-zinc-700' :
                                  'bg-stone-200 text-stone-700'
                                }`}>
                                  {customer.procedure}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-600 text-sm">
                                {customer.staffName && (
                                  <span>{customer.staffName} {customer.staffPosition && <span className="text-slate-400">({customer.staffPosition})</span>}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-slate-600 text-sm">
                                <div>{customer.date}</div>
                                {customer.appointmentTime && (
                                  <div className="text-slate-400">{customer.appointmentTime}</div>
                                )}
                              </td>
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
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleViewDetail(customer)}
                                    className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="상세보기"
                                  >
                                    <Image size={16} />
                                  </button>
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
                        {customers.length === 0 ? '등록된 고객이 없습니다.' : '검색 결과가 없습니다.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 예약 스케줄 */}
              {activeTab === 'schedule' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        const date = new Date(selectedDate);
                        date.setDate(date.getDate() - 1);
                        setSelectedDate(date.toISOString().split('T')[0]);
                      }}
                      className="p-2 bg-white/70 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-4 py-2 bg-white/70 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const date = new Date(selectedDate);
                        date.setDate(date.getDate() + 1);
                        setSelectedDate(date.toISOString().split('T')[0]);
                      }}
                      className="p-2 bg-white/70 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <button
                      onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                      className="px-4 py-2 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition-colors"
                    >
                      오늘
                    </button>
                    <span className="text-lg font-semibold text-slate-700">
                      {new Date(selectedDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                    </span>
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="font-semibold text-slate-700">예약 타임테이블</h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                      {timeSlots.map(time => {
                        const appointments = customers.filter(
                          c => c.date === selectedDate && c.appointmentTime === time
                        );
                        return (
                          <div key={time} className="flex">
                            <div className="w-20 px-4 py-3 bg-slate-50/50 text-sm font-medium text-slate-600 border-r border-slate-100 sticky left-0">
                              {time}
                            </div>
                            <div className="flex-1 px-4 py-2 min-h-[50px]">
                              {appointments.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {appointments.map(apt => (
                                    <button
                                      key={apt.id}
                                      onClick={() => handleViewDetail(apt)}
                                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 flex items-center gap-2 ${
                                        apt.grade === 'VVIP' ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                                        apt.grade === 'VIP' ? 'bg-purple-100 text-purple-700 border border-purple-300' :
                                        apt.category === '수술' ? 'bg-red-100 text-red-700 border border-red-200' :
                                        apt.category === '피부시술' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                        apt.category === '상담' ? 'bg-green-100 text-green-700 border border-green-200' :
                                        'bg-gray-100 text-gray-700 border border-gray-200'
                                      }`}
                                    >
                                      {apt.grade === 'VVIP' && <Crown size={14} />}
                                      {apt.grade === 'VIP' && <Star size={14} />}
                                      <span className="font-semibold">{apt.name}</span>
                                      <span className="opacity-75">{apt.procedure}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-full flex items-center text-slate-300 text-sm">-</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm text-slate-500">범례:</span>
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1"><Crown size={12} /> VVIP</span>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs flex items-center gap-1"><Star size={12} /> VIP</span>
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">수술</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">피부시술</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">상담</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">관리</span>
                  </div>
                </div>
              )}

              {/* 공지사항 */}
              {activeTab === 'announcements' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-700">공지사항 목록</h2>
                    <button
                      onClick={() => { setEditingAnnouncement(null); setShowAnnouncementModal(true); }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-600 to-gray-600 rounded-xl text-white font-medium hover:from-slate-700 hover:to-gray-700 transition-all shadow-lg"
                    >
                      <Plus size={18} />
                      <span>공지 작성</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {announcements.length === 0 ? (
                      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 p-12 text-center shadow-lg">
                        <Megaphone className="mx-auto text-slate-300 mb-4" size={48} />
                        <p className="text-slate-400">등록된 공지사항이 없습니다.</p>
                      </div>
                    ) : (
                      announcements.map(announcement => (
                        <div
                          key={announcement.id}
                          className={`bg-white/80 backdrop-blur-sm rounded-2xl border shadow-lg overflow-hidden ${
                            announcement.important ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
                          }`}
                        >
                          <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {announcement.important && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                                      중요
                                    </span>
                                  )}
                                  <h3 className="text-lg font-semibold text-slate-800">{announcement.title}</h3>
                                </div>
                                <p className="text-slate-600 whitespace-pre-wrap">{announcement.content}</p>
                                <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
                                  <span>{announcement.createdBy}</span>
                                  <span>{formatTimeAgo(announcement.createdAt)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => { setEditingAnnouncement(announcement); setShowAnnouncementModal(true); }}
                                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteAnnouncement(announcement.id)}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
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

      {/* 고객 모달 */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          staffList={staffList}
          onSave={handleSaveCustomer}
          onClose={() => { setShowModal(false); setEditingCustomer(null); }}
        />
      )}

      {/* 고객 상세 모달 */}
      {showDetailModal && selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => { setShowDetailModal(false); setSelectedCustomer(null); }}
          onUpdate={(updated) => setSelectedCustomer(updated)}
        />
      )}

      {/* 공지사항 모달 */}
      {showAnnouncementModal && (
        <AnnouncementModal
          announcement={editingAnnouncement}
          onSave={handleSaveAnnouncement}
          onClose={() => { setShowAnnouncementModal(false); setEditingAnnouncement(null); }}
        />
      )}

      {/* 프로필 모달 */}
      {showProfileModal && (
        <ProfileModal
          profile={userProfile}
          email={user.email}
          onSave={handleSaveProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}

// 통계 카드
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
        <div className="p-2 rounded-lg bg-white/70">
          <Icon size={20} />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

// 고객 모달
function CustomerModal({ customer, staffList, onSave, onClose }) {
  const [form, setForm] = useState(customer || {
    name: '',
    phone: '',
    grade: '일반',
    category: '수술',
    procedure: '',
    staffId: '',
    staffName: '',
    staffPosition: '',
    visitSource: '인터넷',
    paymentMethod: '카드',
    paymentStatus: '완납',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    appointmentTime: '',
    memo: ''
  });

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setForm({ ...form, phone: formatted });
  };

  const handleStaffChange = (e) => {
    const staffId = e.target.value;
    if (staffId) {
      const staff = staffList.find(s => s.id === staffId);
      if (staff) {
        setForm({
          ...form,
          staffId: staff.id,
          staffName: staff.name,
          staffPosition: staff.position
        });
      }
    } else {
      setForm({
        ...form,
        staffId: '',
        staffName: '',
        staffPosition: ''
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, amount: parseInt(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl">
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
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">고객 등급</label>
              <select
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none ${
                  form.grade === 'VVIP' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                  form.grade === 'VIP' ? 'bg-purple-50 border-purple-300 text-purple-700' :
                  'bg-slate-50/50 border-slate-200 text-slate-800'
                }`}
              >
                {customerGrades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">연락처 *</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={handlePhoneChange}
                placeholder="010-0000-0000"
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">담당자</label>
              <select
                value={form.staffId}
                onChange={handleStaffChange}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              >
                <option value="">선택하세요</option>
                {staffList.map(staff => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.position})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">대분류 *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, procedure: '' })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">시술명 *</label>
              <select
                value={form.procedure}
                onChange={(e) => setForm({ ...form, procedure: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
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
              <label className="block text-sm font-medium text-slate-600 mb-2">예약 날짜 *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">예약 시간</label>
              <select
                value={form.appointmentTime}
                onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              >
                <option value="">선택하세요</option>
                {timeSlots.map(time => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">내원경로</label>
              <select
                value={form.visitSource}
                onChange={(e) => setForm({ ...form, visitSource: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              >
                {visitSources.map(src => <option key={src} value={src}>{src}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">결제수단</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              >
                <option value="">선택하세요</option>
                {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">납부상태</label>
              <select
                value={form.paymentStatus}
                onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
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
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">메모</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none resize-none"
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
              className="flex-1 px-4 py-3 bg-gradient-to-r from-slate-600 to-gray-600 text-white rounded-xl hover:from-slate-700 hover:to-gray-700 transition-all font-medium shadow-lg"
            >
              {customer ? '수정하기' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 고객 상세 모달
function CustomerDetailModal({ customer, onClose, onUpdate }) {
  const [beforeImage, setBeforeImage] = useState(customer.beforeImage || null);
  const [afterImage, setAfterImage] = useState(customer.afterImage || null);
  const [uploading, setUploading] = useState(false);
  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);

  const handleImageUpload = async (file, type) => {
    if (!file) return;
    
    setUploading(true);
    try {
      const storageRef = ref(storage, `customers/${customer.id}/${type}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      const customerRef = doc(db, 'customers', customer.id);
      await updateDoc(customerRef, {
        [type === 'before' ? 'beforeImage' : 'afterImage']: url
      });

      if (type === 'before') {
        setBeforeImage(url);
      } else {
        setAfterImage(url);
      }
      
      onUpdate({ ...customer, [type === 'before' ? 'beforeImage' : 'afterImage']: url });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (type) => {
    if (!confirm('이미지를 삭제하시겠습니까?')) return;
    
    try {
      const customerRef = doc(db, 'customers', customer.id);
      await updateDoc(customerRef, {
        [type === 'before' ? 'beforeImage' : 'afterImage']: null
      });

      if (type === 'before') {
        setBeforeImage(null);
      } else {
        setAfterImage(null);
      }
      
      onUpdate({ ...customer, [type === 'before' ? 'beforeImage' : 'afterImage']: null });
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('이미지 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl">
          <h2 className="text-xl font-semibold text-slate-800">고객 상세 정보</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold ${
              customer.grade === 'VVIP' ? 'bg-gradient-to-br from-amber-400 to-amber-600' :
              customer.grade === 'VIP' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
              'bg-gradient-to-br from-slate-400 to-gray-400'
            }`}>
              {customer.grade === 'VVIP' ? <Crown size={28} /> :
               customer.grade === 'VIP' ? <Star size={28} /> :
               customer.name?.[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-800">{customer.name}</h3>
                {customer.grade && customer.grade !== '일반' && (
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    customer.grade === 'VVIP' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {customer.grade}
                  </span>
                )}
              </div>
              <p className="text-slate-500">{customer.phone}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                  customer.category === '수술' ? 'bg-slate-200 text-slate-700' :
                  customer.category === '피부시술' ? 'bg-gray-200 text-gray-700' :
                  customer.category === '상담' ? 'bg-zinc-200 text-zinc-700' :
                  'bg-stone-200 text-stone-700'
                }`}>
                  {customer.category}
                </span>
                <span className="text-slate-600">{customer.procedure}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-800">₩{customer.amount?.toLocaleString()}</p>
              <p className={`text-sm font-medium ${
                customer.paymentStatus === '완납' ? 'text-emerald-600' :
                customer.paymentStatus === '예약금' ? 'text-amber-600' :
                customer.paymentStatus === '잔금' ? 'text-orange-600' :
                'text-red-600'
              }`}>
                {customer.paymentStatus}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm text-slate-500">예약일</p>
              <p className="font-medium text-slate-700">{customer.date}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">예약시간</p>
              <p className="font-medium text-slate-700">{customer.appointmentTime || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">담당자</p>
              <p className="font-medium text-slate-700">
                {customer.staffName ? `${customer.staffName} (${customer.staffPosition})` : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">내원경로</p>
              <p className="font-medium text-slate-700">{customer.visitSource}</p>
            </div>
          </div>

          {customer.memo && (
            <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-sm text-amber-600 font-medium mb-1">메모</p>
              <p className="text-slate-700">{customer.memo}</p>
            </div>
          )}

          <div className="border-t border-slate-100 pt-6">
            <h4 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Camera size={20} />
              시술 전/후 사진
            </h4>
            
            {uploading && (
              <div className="text-center py-4 text-slate-500">
                <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                업로드 중...
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">시술 전 (Before)</p>
                {beforeImage ? (
                  <div className="relative group">
                    <img 
                      src={beforeImage} 
                      alt="Before" 
                      className="w-full h-64 object-cover rounded-xl border border-slate-200"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                      <button
                        onClick={() => beforeInputRef.current?.click()}
                        className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteImage('before')}
                        className="p-2 bg-white rounded-lg text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => beforeInputRef.current?.click()}
                    className="w-full h-64 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                  >
                    <Camera size={32} className="mb-2" />
                    <span>사진 추가</span>
                  </button>
                )}
                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0], 'before')}
                  className="hidden"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">시술 후 (After)</p>
                {afterImage ? (
                  <div className="relative group">
                    <img 
                      src={afterImage} 
                      alt="After" 
                      className="w-full h-64 object-cover rounded-xl border border-slate-200"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                      <button
                        onClick={() => afterInputRef.current?.click()}
                        className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteImage('after')}
                        className="p-2 bg-white rounded-lg text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => afterInputRef.current?.click()}
                    className="w-full h-64 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                  >
                    <Camera size={32} className="mb-2" />
                    <span>사진 추가</span>
                  </button>
                )}
                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0], 'after')}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// 공지사항 모달
function AnnouncementModal({ announcement, onSave, onClose }) {
  const [form, setForm] = useState(announcement || {
    title: '',
    content: '',
    important: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">
            {announcement ? '공지사항 수정' : '새 공지사항'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">제목 *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="공지사항 제목"
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">내용 *</label>
            <textarea
              required
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="공지사항 내용을 입력하세요"
              rows={6}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400 resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="important"
              checked={form.important}
              onChange={(e) => setForm({ ...form, important: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
            />
            <label htmlFor="important" className="text-sm text-slate-600">
              중요 공지 (대시보드 상단에 표시)
            </label>
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
              className="flex-1 px-4 py-3 bg-gradient-to-r from-slate-600 to-gray-600 text-white rounded-xl hover:from-slate-700 hover:to-gray-700 transition-all font-medium shadow-lg"
            >
              {announcement ? '수정하기' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 프로필 모달
function ProfileModal({ profile, email, onSave, onClose }) {
  const [form, setForm] = useState({
    name: profile?.name || '',
    position: profile?.position || '사원'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">프로필 설정</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-600 to-gray-600 flex items-center justify-center text-white text-3xl font-bold">
              {form.name?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">이메일</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">이름 *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="이름을 입력하세요"
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">직급</label>
            <select
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
            >
              {staffPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>
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
              className="flex-1 px-4 py-3 bg-gradient-to-r from-slate-600 to-gray-600 text-white rounded-xl hover:from-slate-700 hover:to-gray-700 transition-all font-medium shadow-lg"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
