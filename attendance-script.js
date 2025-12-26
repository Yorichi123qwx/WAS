// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCVdv49IiDYrFiKhfVbpD79x3LKLHnbH1k",
    authDomain: "we-attendance-system.firebaseapp.com",
    projectId: "we-attendance-system",
    storageBucket: "we-attendance-system.firebasestorage.app",
    messagingSenderId: "507634052006",
    appId: "1:507634052006:web:fb8aef2a7a227c7e657d67",
    measurementId: "G-N09J816Q4D"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global Variables
let html5QrCode;
let currentMethod = 'face';
let videoStream;
let modelsLoaded = false;
let recognitionActive = false;
let allStudents = [];
let attendanceSettings = null;

// ==================== INITIALIZATION ====================

window.onload = async function() {
    console.log('🚀 Starting attendance system...');
    updateTime();
    setInterval(updateTime, 1000);
    
    // Check attendance availability FIRST
    await loadAttendanceSettings();
    
    // If open, then load models and students
    if (isAttendanceOpen()) {
        loadModels();
    }
};

// Time Display
function updateTime() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    document.getElementById('currentTime').textContent = 
        now.toLocaleDateString('ar-EG', options);
}

// ==================== ATTENDANCE TIME CHECK ====================

// Load Attendance Settings
async function loadAttendanceSettings() {
    try {
        showLoading('جاري التحقق من معاد الحضور...');
        
        const doc = await db.collection('settings').doc('attendance').get();
        
        if (doc.exists) {
            attendanceSettings = doc.data();
        } else {
            attendanceSettings = { mode: 'always' };
        }
        
        console.log('⚙️ Attendance Settings:', attendanceSettings);
        hideLoading();
        
        checkAttendanceAvailability();
    } catch (error) {
        console.error('Error loading attendance settings:', error);
        hideLoading();
        showError('خطأ في تحميل إعدادات الحضور');
    }
}

// Check if Attendance is Available
function checkAttendanceAvailability() {
    const isOpen = isAttendanceOpen();
    
    console.log('🔍 Attendance is:', isOpen ? 'OPEN' : 'CLOSED');
    
    if (!isOpen) {
        showAttendanceClosed();
    } else {
        showMainContent();
    }
}

// Check if Attendance is Open
function isAttendanceOpen() {
    if (!attendanceSettings) return false;
    
    if (attendanceSettings.mode === 'always') {
        return true;
    }
    
    if (attendanceSettings.mode === 'closed') {
        return false;
    }
    
    if (attendanceSettings.mode === 'scheduled') {
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                           now.getMinutes().toString().padStart(2, '0');
        
        const isWithinSchedule = currentTime >= attendanceSettings.startTime && 
                                 currentTime <= attendanceSettings.endTime;
        
        console.log(`⏰ Current: ${currentTime}, Schedule: ${attendanceSettings.startTime} - ${attendanceSettings.endTime}, Within: ${isWithinSchedule}`);
        
        return isWithinSchedule;
    }
    
    return false;
}

// Show Attendance Closed Screen
function showAttendanceClosed() {
    document.getElementById('attendanceClosedScreen').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    
    if (attendanceSettings.mode === 'scheduled') {
        document.getElementById('closedMessage').textContent = 
            'تسجيل الحضور متاح فقط في المعاد المحدد';
        document.getElementById('scheduleInfo').style.display = 'block';
        document.getElementById('scheduleTime').textContent = 
            `من ${attendanceSettings.startTime} إلى ${attendanceSettings.endTime}`;
    } else {
        document.getElementById('closedMessage').textContent = 
            'تسجيل الحضور مغلق حالياً من قبل الإدارة';
        document.getElementById('scheduleInfo').style.display = 'none';
    }
}

// Show Main Content
function showMainContent() {
    document.getElementById('attendanceClosedScreen').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
}

// Check availability every minute
setInterval(() => {
    if (attendanceSettings) {
        checkAttendanceAvailability();
    }
}, 60000);

// ==================== FACE RECOGNITION ====================

// Load Face API Models
async function loadModels() {
    try {
        showLoading('جاري تحميل نماذج التعرف على الوجه...');
        
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';
        
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        
        modelsLoaded = true;
        console.log('✅ Face recognition models loaded');
        
        hideLoading();
        await loadAllStudents();
    } catch (error) {
        console.error('Error loading models:', error);
        hideLoading();
        showError('خطأ في تحميل نماذج التعرف على الوجه');
    }
}

// Load All Students
async function loadAllStudents() {
    try {
        showLoading('جاري تحميل بيانات الطلاب...');
        
        const snapshot = await db.collection('students')
            .where('active', '==', true)
            .get();
        
        allStudents = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.faceDescriptor && Array.isArray(data.faceDescriptor)) {
                allStudents.push({
                    id: doc.id,
                    ...data,
                    faceDescriptor: new Float32Array(data.faceDescriptor)
                });
            }
        });
        
        console.log(`✅ Loaded ${allStudents.length} students`);
        hideLoading();
    } catch (error) {
        console.error('Error loading students:', error);
        hideLoading();
        showError('خطأ في تحميل بيانات الطلاب');
    }
}

// Start Camera
async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 640, 
                height: 480,
                facingMode: 'user'
            } 
        });
        const video = document.getElementById('video-element');
        video.srcObject = videoStream;
    } catch (error) {
        console.error('Error accessing camera:', error);
        showError('خطأ في الوصول إلى الكاميرا');
    }
}

// Stop Camera
function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    recognitionActive = false;
    document.getElementById('scanningStatus').classList.add('hidden');
}

// Face Recognition Button
document.getElementById('startFaceBtn').addEventListener('click', async function() {
    // Check if attendance is still open
    if (!isAttendanceOpen()) {
        showError('عذراً، تسجيل الحضور مغلق حالياً');
        checkAttendanceAvailability(); // Refresh screen
        return;
    }
    
    if (!modelsLoaded) {
        await loadModels();
    }
    
    if (allStudents.length === 0) {
        showError('لا يوجد طلاب مسجلين في النظام');
        return;
    }
    
    await startCamera();
    recognitionActive = true;
    
    document.getElementById('startFaceBtn').textContent = 'جاري البحث عن الوجه...';
    document.getElementById('startFaceBtn').disabled = true;
    document.getElementById('scanningStatus').classList.remove('hidden');
    document.getElementById('scanningStatus').textContent = '🔍 جاري البحث عن وجهك...';
    
    recognizeFace();
});

// Recognize Face
async function recognizeFace() {
    if (!recognitionActive) return;
    
    const video = document.getElementById('video-element');
    const statusDiv = document.getElementById('scanningStatus');
    
    if (video.readyState === 4) {
        try {
            const detection = await faceapi
                .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
            
            if (detection) {
                statusDiv.textContent = '✓ تم اكتشاف وجه - جاري المقارنة...';
                
                const faceDescriptor = detection.descriptor;
                let bestMatch = null;
                let bestDistance = Infinity;
                const MATCH_THRESHOLD = 0.6;
                
                for (const student of allStudents) {
                    if (!student.faceDescriptor) continue;
                    
                    const distance = faceapi.euclideanDistance(
                        faceDescriptor, 
                        student.faceDescriptor
                    );
                    
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestMatch = student;
                    }
                }
                
                if (bestMatch && bestDistance < MATCH_THRESHOLD) {
                    recognitionActive = false;
                    stopCamera();
                    
                    const matchPercentage = Math.round((1 - bestDistance) * 100);
                    console.log(`✅ Match: ${bestMatch.name} (${matchPercentage}%)`);
                    
                    await recordAttendance(bestMatch, matchPercentage);
                    return;
                } else {
                    statusDiv.textContent = '❌ لم يتم العثور على تطابق';
                }
            } else {
                statusDiv.textContent = '🔍 جاري البحث عن وجه...';
            }
        } catch (error) {
            console.error('Face recognition error:', error);
        }
    }
    
    setTimeout(recognizeFace, 100);
}

// ==================== RECORD ATTENDANCE ====================

async function recordAttendance(student, matchPercentage = null) {
    // Final check before recording
    if (!isAttendanceOpen()) {
        showError('عذراً، تم إغلاق تسجيل الحضور');
        checkAttendanceAvailability();
        return;
    }
    
    showLoading('جاري تسجيل الحضور...');
    hideError();

    try {
        const today = new Date().toLocaleDateString('ar-EG');
        const existingAttendance = await db.collection('attendance')
            .where('studentId', '==', student.id)
            .where('date', '==', today)
            .get();

        if (!existingAttendance.empty) {
            hideLoading();
            showError('تم تسجيل حضورك بالفعل اليوم');
            resetToMethod();
            return;
        }

        const now = new Date();
        const attendanceData = {
            studentId: student.id,
            studentName: student.name,
            grade: student.grade,
            department: student.department,
            class: student.class,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            date: today,
            time: now.toLocaleTimeString('ar-EG'),
            status: 'حاضر',
            method: matchPercentage ? `التعرف على الوجه (${matchPercentage}%)` : currentMethod
        };

        await db.collection('attendance').add(attendanceData);

        hideLoading();
        showSuccess(student, now, matchPercentage);
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        showError('خطأ في تسجيل الحضور');
        resetToMethod();
    }
}

// ==================== OTHER METHODS ====================

function selectMethod(method) {
    // Check if attendance is still open
    if (!isAttendanceOpen()) {
        showError('عذراً، تسجيل الحضور مغلق حالياً');
        checkAttendanceAvailability();
        return;
    }
    
    currentMethod = method;
    
    document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.method-btn').classList.add('active');
    
    document.querySelectorAll('.scan-section').forEach(section => {
        section.classList.remove('active');
    });
    
    if (method !== 'face' && videoStream) {
        stopCamera();
    }
    
    if (method === 'face') {
        document.getElementById('faceSection').classList.add('active');
    } else if (method === 'qr') {
        document.getElementById('qrSection').classList.add('active');
    } else {
        document.getElementById('idSection').classList.add('active');
        document.getElementById('studentIdInput').focus();
    }
    
    hideError();
}

// QR Code Scanner
document.getElementById('startQrBtn').addEventListener('click', startQRScanner);

function startQRScanner() {
    if (!isAttendanceOpen()) {
        showError('عذراً، تسجيل الحضور مغلق حالياً');
        checkAttendanceAvailability();
        return;
    }
    
    html5QrCode = new Html5Qrcode("qr-reader");
    
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess
    ).catch(err => {
        showError('خطأ في تشغيل الكاميرا');
    });

    document.getElementById('startQrBtn').textContent = 'جاري المسح...';
    document.getElementById('startQrBtn').disabled = true;
}

async function onScanSuccess(decodedText) {
    html5QrCode.stop().then(async () => {
        const student = allStudents.find(s => s.id === decodedText);
        if (student) {
            await recordAttendance(student);
        } else {
            showError('الكود غير صحيح');
            resetToMethod();
        }
    });
}

// ID Input
document.getElementById('submitIdBtn').addEventListener('click', submitId);
document.getElementById('studentIdInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitId();
});

async function submitId() {
    if (!isAttendanceOpen()) {
        showError('عذراً، تسجيل الحضور مغلق حالياً');
        checkAttendanceAvailability();
        return;
    }
    
    const studentId = document.getElementById('studentIdInput').value.trim().toUpperCase();
    
    if (!studentId) {
        showError('الرجاء إدخال كود الطالب');
        return;
    }
    
    const student = allStudents.find(s => s.id === studentId);
    if (student) {
        await recordAttendance(student);
    } else {
        showError('الكود غير صحيح');
    }
}

// ==================== UI FUNCTIONS ====================

function showSuccess(student, time, matchPercentage) {
    document.getElementById('methodSelector').classList.add('hidden');
    document.getElementById('faceSection').classList.remove('active');
    document.getElementById('qrSection').classList.remove('active');
    document.getElementById('idSection').classList.remove('active');
    document.getElementById('successSection').classList.add('active');

    const photoHTML = student.photoBase64 
        ? `<img src="${student.photoBase64}" class="student-photo" alt="${student.name}">` 
        : `<div class="student-photo" style="background: #1e3c72; color: white; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold;">${student.name.charAt(0)}</div>`;

    const matchHTML = matchPercentage 
        ? `<div class="match-confidence">✓ نسبة التطابق: ${matchPercentage}%</div>` 
        : '';

    document.getElementById('successDetails').innerHTML = `
        <div class="student-card">
            ${photoHTML}
            <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-details">📚 ${student.grade} - ${student.department}</div>
                <div class="student-details">🏫 الفصل: ${student.class}</div>
                <div class="student-details">⏰ ${time.toLocaleTimeString('ar-EG')}</div>
            </div>
        </div>
        ${matchHTML}
    `;
}

document.getElementById('newAttendanceBtn').addEventListener('click', resetToMethod);

function showLoading(text = 'جاري التحقق...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingSection').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingSection').classList.add('hidden');
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = '⚠️ ' + message;
    errorDiv.classList.remove('hidden');
    
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

function hideError() {
    document.getElementById('errorMessage').classList.add('hidden');
}

function resetToMethod() {
    document.getElementById('methodSelector').classList.remove('hidden');
    document.getElementById('successSection').classList.remove('active');
    
    if (currentMethod === 'face') {
        document.getElementById('faceSection').classList.add('active');
        document.getElementById('startFaceBtn').textContent = 'ابدأ التعرف على الوجه';
        document.getElementById('startFaceBtn').disabled = false;
        document.getElementById('scanningStatus').classList.add('hidden');
    } else if (currentMethod === 'qr') {
        document.getElementById('qrSection').classList.add('active');
        document.getElementById('startQrBtn').textContent = 'ابدأ المسح';
        document.getElementById('startQrBtn').disabled = false;
        document.getElementById('qr-reader').innerHTML = '';
    } else {
        document.getElementById('idSection').classList.add('active');
        document.getElementById('studentIdInput').value = '';
        document.getElementById('studentIdInput').focus();
    }
}
