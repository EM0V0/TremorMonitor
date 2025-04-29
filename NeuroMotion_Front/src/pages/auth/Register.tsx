import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// Role type definition
type Role = 'doctor' | 'admin' | 'family';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('doctor');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Animation state
  const [isReady, setIsReady] = useState(false);
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<string>('');
  
  // Set animation ready state after component mount
  useEffect(() => {
    setTimeout(() => setIsReady(true), 100);
    
    // Force HTML document language to English
    document.documentElement.lang = 'en';
    
    // Override browser validation message
    const forms = document.getElementsByTagName('form');
    for (let i = 0; i < forms.length; i++) {
      forms[i].setAttribute('novalidate', 'novalidate');
    }
  }, []);
  
  // Real-time password match checking
  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
    } else if (confirmPassword) {
      setConfirmPasswordError('');
    }
  }, [password, confirmPassword]);
  
  // Handle form submission with custom validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setDebugInfo('');
    
    // Validate form fields
    let isValid = true;
    
    if (!name.trim()) {
      setNameError('Please enter your full name');
      isValid = false;
    } else if (name.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      isValid = false;
    }
    
    if (!email.trim()) {
      setEmailError('Please enter your email address');
      isValid = false;
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }
    
    if (!password.trim()) {
      setPasswordError('Please enter a password');
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      isValid = false;
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/.test(password)) {
      setPasswordError('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
      isValid = false;
    }
    
    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      isValid = false;
    }
    
    if (!isValid) return;
    
    setIsLoading(true);
    
    try {
      // Log registration attempt
      console.log(`Attempting registration for: ${email}, role: ${selectedRole}`);
      
      // Call registration service
      await register({
        name,
        email,
        password,
        confirmPassword,
        role: selectedRole
      });
      
      // Log successful response
      console.log('Registration successful, navigating to login');
      setDebugInfo(`Registration successful! Please log in with your new account.`);
      
      // Navigate to login page on success
      setTimeout(() => {
        navigate('/login', { state: { registered: true } });
      }, 1500); // Short delay to show success message
    } catch (err: any) {
      console.error('Registration error:', err);
      
      // Handle different error types
      if (err.response?.status === 400) {
        setError(err.response.data.message || 'Invalid registration data. Please check your inputs.');
      } else if (err.response?.status === 409) {
        setError('An account with this email already exists.');
        setEmailError('This email is already registered');
      } else if (err.response?.status === 429) {
        setError('Too many registration attempts. Please try again later.');
      } else if (err.message === 'Network Error') {
        setError('Unable to connect to the server. Please check your connection.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle input change with error clearing
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (nameError) setNameError('');
  };
  
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (emailError) setEmailError('');
  };
  
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (passwordError) setPasswordError('');
  };
  
  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  };
  
  // Password visibility toggle functions
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };
  
  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };
  
  // Illustration component for the left side
  const BrainNetworkIllustration = () => {
    return (
      <div className="w-full max-w-md mx-auto mb-8 relative">
        {/* Decorative elements */}
        <div className="absolute -top-4 -left-12 w-32 h-32 bg-blue-200 rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-indigo-200 rounded-full opacity-20"></div>
        
        <svg
          width="100%"
          height="320"
          viewBox="0 0 500 500"
          xmlns="http://www.w3.org/2000/svg"
          className={`mx-auto transition-opacity duration-1000 ${isReady ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundColor: '#F8FBFF' }}
        >
          {/* Background gradient */}
          <defs>
            <radialGradient id="bgGradient" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#E3ECFF"/>
              <stop offset="100%" stopColor="#F8FBFF"/>
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGradient)" />

          {/* Brain outline shape */}
          <path
            d="M150,200 
               C130,120 280,80 310,180
               C330,250 450,220 400,300
               C370,340 280,360 230,370
               C190,370 160,340 150,300
               C140,260 180,280 150,200
               Z"
            fill="#D9E7FF"
            opacity="0.6"
            stroke="#3E7CE5"
            strokeWidth="2"
          />

          {/* Neural network connections */}
          <line x1="200" y1="220" x2="260" y2="180" stroke="#4D7AE8" strokeWidth="2" />
          <line x1="260" y1="180" x2="320" y2="240" stroke="#4D7AE8" strokeWidth="2" />
          <line x1="320" y1="240" x2="280" y2="300" stroke="#4D7AE8" strokeWidth="2" />
          <line x1="280" y1="300" x2="200" y2="220" stroke="#4D7AE8" strokeWidth="2" />
          <line x1="200" y1="220" x2="240" y2="280" stroke="#4D7AE8" strokeWidth="2" />
          <line x1="260" y1="180" x2="280" y2="300" stroke="#4D7AE8" strokeWidth="2" />
          
          {/* Neural nodes */}
          <circle cx="200" cy="220" r="8" fill="#3E7CE5" />
          <circle cx="260" cy="180" r="6" fill="#6A9CFE" />
          <circle cx="320" cy="240" r="8" fill="#3E7CE5" />
          <circle cx="280" cy="300" r="8" fill="#3E7CE5" />
          <circle cx="240" cy="280" r="5" fill="#6A9CFE" />
          
          {/* Additional decorative nodes */}
          <circle cx="180" cy="270" r="5" fill="#9CBCFF" opacity="0.8" />
          <circle cx="340" cy="270" r="5" fill="#9CBCFF" opacity="0.8" />
          <circle cx="230" cy="160" r="5" fill="#9CBCFF" opacity="0.8" />
        </svg>
      </div>
    );
  };
  
  // Feature card with icon
  const FeatureCard = ({ icon, text }: { icon: string, text: string }) => (
    <div className="p-4 bg-white bg-opacity-90 rounded-lg shadow-sm border border-blue-100 transition-all duration-300 hover:shadow-md hover:border-blue-200">
      <div className="flex items-center">
        <div className="mr-3 text-blue-600">
          {icon === 'shield' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {icon === 'users' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
          )}
          {icon === 'device' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <p className="text-blue-800 font-medium flex-1">{text}</p>
      </div>
    </div>
  );
  
  // Role selection button component
  const RoleButton = ({ role, label }: { role: Role, label: string }) => (
    <button
      type="button"
      onClick={() => setSelectedRole(role)}
      className={`flex-1 py-2 px-3 rounded-full text-center transition-all duration-200 ${
        selectedRole === role
          ? 'bg-blue-500 text-white shadow-md transform scale-105'
          : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
  
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Left side - Branding and Illustration */}
      <div className={`hidden lg:flex lg:w-1/2 flex-col items-center justify-center px-8 py-8 transition-opacity duration-1000 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full max-w-md flex flex-col items-center mt-[-50px]">
          <div className="mb-6 transition-all duration-500 transform hover:scale-105">
            <h1 className="text-4xl font-bold text-blue-800 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-600">NeuroSync</h1>
            <h2 className="text-xl text-blue-600 text-center mt-2">Parkinson's Monitoring System</h2>
          </div>
          
          {/* Brain Network Illustration */}
          <BrainNetworkIllustration />
          
          {/* Marketing points with icons */}
          <div className="w-full space-y-3 mt-2">
            <FeatureCard 
              icon="shield" 
              text="Create an account to securely monitor patient data" 
            />
            <FeatureCard 
              icon="users" 
              text="Collaborate with patients and healthcare team" 
            />
            <FeatureCard 
              icon="device" 
              text="Access from any device, anytime, anywhere" 
            />
          </div>
        </div>
      </div>
      
      {/* Right side - Registration Form */}
      <div className={`w-full lg:w-1/2 flex items-center justify-center p-6 transition-opacity duration-1000 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8 transition-all duration-300">
          <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Create Your Account</h1>
          <p className="text-gray-600 text-center mb-8">Join NeuroSync and start managing patient data</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-md animate-fadeIn">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          {debugInfo && (
            <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-700 rounded-md animate-fadeIn">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">{debugInfo}</p>
                </div>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Name Input */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <div className={`relative rounded-md shadow-sm transition duration-150 ${activeInput === 'name' ? 'ring-2 ring-blue-300' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={handleNameChange}
                  onFocus={() => setActiveInput('name')}
                  onBlur={() => setActiveInput(null)}
                  className={`w-full py-3 pl-10 pr-3 border ${nameError ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition duration-150`}
                  placeholder="John Doe"
                />
              </div>
              {nameError && (
                <p className="mt-1 text-sm text-red-600">{nameError}</p>
              )}
            </div>
            
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className={`relative rounded-md shadow-sm transition duration-150 ${activeInput === 'email' ? 'ring-2 ring-blue-300' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  onFocus={() => setActiveInput('email')}
                  onBlur={() => setActiveInput(null)}
                  className={`w-full py-3 pl-10 pr-3 border ${emailError ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition duration-150`}
                  placeholder="doctor@hospital.org"
                />
              </div>
              {emailError && (
                <p className="mt-1 text-sm text-red-600">{emailError}</p>
              )}
            </div>
            
            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className={`relative rounded-md shadow-sm transition duration-150 ${activeInput === 'password' ? 'ring-2 ring-blue-300' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={handlePasswordChange}
                  onFocus={() => setActiveInput('password')}
                  onBlur={() => setActiveInput(null)}
                  className={`w-full py-3 pl-10 pr-12 border ${passwordError ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition duration-150`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center cursor-pointer"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 hover:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 hover:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <p className="mt-1 text-sm text-red-600">{passwordError}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Must be at least 8 characters with uppercase, lowercase, number, and special character
              </p>
            </div>
            
            {/* Confirm Password Input */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className={`relative rounded-md shadow-sm transition duration-150 ${activeInput === 'confirmPassword' ? 'ring-2 ring-blue-300' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  onFocus={() => setActiveInput('confirmPassword')}
                  onBlur={() => setActiveInput(null)}
                  className={`w-full py-3 pl-10 pr-12 border ${confirmPasswordError ? 'border-red-300' : confirmPassword && !confirmPasswordError ? 'border-green-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition duration-150`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={toggleConfirmPasswordVisibility}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 hover:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 hover:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
              {confirmPasswordError && (
                <p className="mt-1 text-sm text-red-600">{confirmPasswordError}</p>
              )}
              {confirmPassword && !confirmPasswordError && (
                <p className="mt-1 text-sm text-green-600">Passwords match</p>
              )}
            </div>
            
            {/* Role Selection */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
              <div className="flex space-x-3">
                <RoleButton role="doctor" label="Doctor" />
                <RoleButton role="family" label="Family" />
                <RoleButton role="admin" label="Admin" />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-md shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-300 transform hover:-translate-y-0.5 ${
                isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
            
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
            
            {import.meta.env.DEV && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Developer Options</h3>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setName('Test User');
                      setEmail('test@example.com');
                      setPassword('Password123!');
                      setConfirmPassword('Password123!');
                      setSelectedRole('doctor');
                    }}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 py-1 px-2 rounded transition-colors"
                  >
                    Fill Test Credentials
                  </button>
                </div>
              </div>
            )}
          </form>
          
          <div className="mt-10 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">© 2025 Darkside. All rights reserved.</p>
            <p className="text-xs text-gray-500 mt-1">Privacy Policy • Terms of Service • Support</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register; 