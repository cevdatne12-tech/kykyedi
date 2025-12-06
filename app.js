import { db } from './firebase-config.js';

import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, updateDoc, getDoc, limit, startAfter, getDocs, where, deleteDoc, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const auth = getAuth();

// DOM Elements
const orderForm = document.getElementById('orderForm');
const submitBtn = document.getElementById('submitBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const btnText = document.querySelector('.btn-text');
const roomInput = document.getElementById('roomNumber');
const roomFeedback = document.getElementById('roomFeedback');
const shopStatusToggle = document.getElementById('shopStatusToggle');
const shopStatusLabel = document.getElementById('shopStatusLabel');
const shopClosedMessageInput = document.getElementById('shopClosedMessage');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const shopClosedAlert = document.getElementById('shopClosedAlert');
const displayClosedMessage = document.getElementById('displayClosedMessage');

// Admin Elements
// Admin Elements
const adminModalEl = document.getElementById('adminModal');
const adminModal = adminModalEl ? new bootstrap.Modal(adminModalEl) : null;

const loginModalEl = document.getElementById('loginModal');
const loginModal = loginModalEl ? new bootstrap.Modal(loginModalEl) : null;
const ordersTableBody = document.getElementById('ordersTableBody');
const orderCountBadge = document.getElementById('orderCount');
const loginForm = document.getElementById('loginForm');
const adminShortcutBtn = document.getElementById('adminShortcutBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');

let ordersUnsubscribe = null; // To manage real-time listener
let currentPage = 1;
let currentFilter = 'all'; // 'all', 'pending', 'preparing', 'delivered'
let lastVisibleSnapshots = []; // Stack to store last visible doc of each page for pagination
const ORDERS_PER_PAGE = 50;

// Admin Shortcut Listener
if (adminShortcutBtn) {
    adminShortcutBtn.addEventListener('click', () => {
        // Check if already logged in
        if (auth.currentUser) {
            if (adminModal) {
                adminModal.show();
                listenForOrders(); // Load data immediately
            }
        } else {
            if (loginModal) loginModal.show();
        }
    });
}

// Validation Regex for Room Number (100-1099)
const roomRegex = /^(1[0-9]{2}|[2-9][0-9]{2}|10[0-9]{2})$/;

// --- User Section: Order Submission ---

if (orderForm) {
    orderForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // DEĞİŞİKLİK BURADA BAŞLIYOR: .trim() ekleyerek boşlukları temizleyelim
        const phone = document.getElementById('phone').value.trim(); 
        const block = document.querySelector('input[name="block"]:checked').value;
        const roomNumber = parseInt(roomInput.value);
        const wrapCount = parseInt(document.getElementById('wrapCount').value);
        const note = document.getElementById('note').value;

        // --- YENİ EKLENECEK KOD BLOĞU (Telefon Kontrolü) ---
        if (!phone) {
            Swal.fire('Uyarı', 'Lütfen telefon numaranızı giriniz.', 'warning');
            return;
        }
        
        // İsterseniz numaranın uzunluğunu da (örn: en az 10 hane) kontrol edebilirsiniz:
        if (phone.length < 10) {
            Swal.fire('Uyarı', 'Lütfen geçerli bir telefon numarası giriniz.', 'warning');
            return;
        }
        // --- EKLENECEK KOD BLOĞU SONU ---

        // Mevcut kod devam ediyor...
        // Validate Room Number
        if (!roomRegex.test(roomNumber)) {
            roomInput.classList.add('is-invalid');
            return;
        } else {
            roomInput.classList.remove('is-invalid');
        }

        // Validate Wrap Count
        if (isNaN(wrapCount) || wrapCount < 1) {
            Swal.fire('Uyarı', 'Lütfen geçerli bir dürüm sayısı giriniz.', 'warning');
            return;
        }

        // Show Loading
        setLoading(true);

        try {
    // ÖNCE MAĞAZA AÇIK MI KONTROL ET
    const settingsSnap = await getDoc(doc(db, "settings", "shop"));
    if (settingsSnap.exists() && settingsSnap.data().isOpen === false) {
        setLoading(false);
        Swal.fire({
            icon: 'error',
            title: 'Sipariş Alınamadı',
            text: 'Üzgünüz, mağazamız şu an sipariş alımına kapatılmıştır.'
        });
        return; // İşlemi durdur
    }
            const docRef = await addDoc(collection(db, "orders"), {
                phone: phone,
                block: block,
                roomNumber: roomNumber,
                wrapCount: wrapCount,
                note: note,
                status: 'pending',
                timestamp: serverTimestamp()
            });

            // Save ID to LocalStorage
            localStorage.setItem('lastOrderId', docRef.id);

            // Success Message with ID
            Swal.fire({
                title: 'Sipariş Alındı!',
                html: `Sipariş Kodunuz: <strong>${docRef.id}</strong><br>Bu kodu siparişinizi takip etmek için kullanabilirsiniz.<br><small class="text-muted">(Kod tarayıcınıza kaydedildi)</small>`,
                icon: 'success',
                confirmButtonText: 'Tamam',
                confirmButtonColor: '#ff4757'
            });

            orderForm.reset();
        } catch (error) {
            console.error("Error adding document: ", error);
            Swal.fire({
                title: 'Hata!',
                text: 'Sipariş gönderilirken bir sorun oluştu via Firebase.',
                icon: 'error',
                confirmButtonText: 'Tamam'
            });
        } finally {
            setLoading(false);
        }
    });

    // Real-time validation feedback
    roomInput.addEventListener('input', () => {
        if (roomRegex.test(roomInput.value)) {
            roomInput.classList.remove('is-invalid');
            roomInput.classList.add('is-valid');
        } else {
            roomInput.classList.remove('is-valid');
            roomInput.classList.add('is-invalid');
        }
    });
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.disabled = true;
        loadingSpinner.classList.remove('d-none');
        btnText.textContent = 'Gönderiliyor...';
    } else {
        submitBtn.disabled = false;
        loadingSpinner.classList.add('d-none');
        btnText.textContent = 'Sipariş Ver';
    }
}

// --- Admin Section ---

// Check URL for admin parameter
const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === 'true';

// Auth State Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        if (loginModal) loginModal.hide();

        if (isAdmin) {
            if (adminModal) {
                adminModal.show();
                listenForOrders();
            }
        }
    } else {
        // User is signed out
        if (isAdmin) {
            if (loginModal) loginModal.show();
        }
    }
});

// Login Form Submit
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Explicitly show admin modal after manual login
            if (adminModal) {
                adminModal.show();
                listenForOrders();
            }
        } catch (error) {
            console.error("Login Error:", error);
            Swal.fire('Hata', 'Giriş başarısız. E-posta veya şifre hatalı.', 'error');
        }
    });
}

// Add Sign Out Button to Admin Modal (Optional but good practice)
// For now, we just rely on page refresh or session expiry, 
// but let's add a simple log out logic if needed.


// Helper Functions
function getStatusBadge(status) {
    switch (status) {
        case 'pending': return '<span class="badge bg-warning text-dark">Bekliyor</span>';
        case 'preparing': return '<span class="badge bg-primary">Hazırlanıyor</span>';
        case 'on_way': return '<span class="badge bg-info text-dark">Yola Çıktı</span>';
        case 'delivered': return '<span class="badge bg-success">Teslim Edildi</span>';
        default: return '<span class="badge bg-secondary">Bilinmiyor</span>';
    }
}

function setLoadingAdmin(isLoading) {
    const tableBody = document.getElementById('ordersTableBody');
    if (isLoading && tableBody) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Yükleniyor...</span></div></td></tr>';
    }
}

function renderOrders(docs) {
    const ordersTableBody = document.getElementById('ordersTableBody');
    if (!ordersTableBody) {
        console.error("Critical Error: ordersTableBody element not found in DOM!");
        return;
    }
    ordersTableBody.innerHTML = '';

    docs.forEach((docSnap) => {
        const order = docSnap.data();
        const id = docSnap.id;

        const row = document.createElement('tr');

        // Detailed Date Format: 29.11.2025 14:45
        let dateStr = '-';
        if (order.timestamp) {
            const dateObj = order.timestamp.toDate();
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            dateStr = `${day}.${month}.${year} ${hours}:${minutes}`;
        }

        row.innerHTML = `
            <td>${dateStr}</td>
            <td><span class="fw-bold">${order.block} Blok</span> - ${order.roomNumber}</td>
            <td><span class="badge bg-info text-dark">${order.wrapCount || 1} Adet</span></td>
            <td>${order.note || '-'}</td>
            <td>${order.phone || '-'}</td>
            <td>${getStatusBadge(order.status)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-warning" onclick="updateStatus('${id}', 'pending')">Bekliyor</button>
                    <button type="button" class="btn btn-outline-primary" onclick="updateStatus('${id}', 'preparing')">Hazırlanıyor</button>
                    <button type="button" class="btn btn-outline-info" onclick="updateStatus('${id}', 'on_way')">Yola Çıktı</button>
                    <button type="button" class="btn btn-outline-success" onclick="updateStatus('${id}', 'delivered')">Teslim</button>
                </div>
            </td>
        `;
        ordersTableBody.appendChild(row);
    });
}



function updatePaginationUI(hasMore) {
    pageIndicator.textContent = currentPage === 1 ? 'Sayfa 1 (Canlı)' : `Sayfa ${currentPage} (Geçmiş)`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = !hasMore;
}

// Page 1: Real-time
function listenForOrders() {
    currentPage = 1;
    lastVisibleSnapshots = []; // Reset stack

    // Prevent multiple listeners
    if (ordersUnsubscribe) {
        ordersUnsubscribe();
    }

    let q;
    if (currentFilter === 'all') {
        q = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(ORDERS_PER_PAGE));
    } else {
        q = query(collection(db, "orders"), where("status", "==", currentFilter), orderBy("timestamp", "desc"), limit(ORDERS_PER_PAGE));
    }

    ordersUnsubscribe = onSnapshot(q, (snapshot) => {
        renderOrders(snapshot.docs);

        // Update pagination state for Page 1
        if (snapshot.docs.length > 0) {
            lastVisibleSnapshots[1] = snapshot.docs[snapshot.docs.length - 1];
        }
        updatePaginationUI(snapshot.docs.length === ORDERS_PER_PAGE);

        // Count visible active orders.
        let activeCount = snapshot.docs.filter(d => d.data().status !== 'delivered').length;
        if (orderCountBadge) orderCountBadge.textContent = `${activeCount} Aktif (Bu Sayfa)`;
    }, (error) => {
        console.error("Snapshot Error:", error);
        if (error.code === 'failed-precondition') {
            Swal.fire({
                icon: 'warning',
                title: 'İndeks Gerekli',
                text: 'Filtreleme için Firestore indeksi oluşturulması gerekiyor. Konsolu kontrol edin.',
                footer: '<a href="https://console.firebase.google.com/v1/r/project/kykyedi/firestore/indexes" target="_blank">İndeks Oluştur</a>'
            });
        } else {
            Swal.fire('Hata', 'Siparişler yüklenirken bir sorun oluştu.', 'error');
        }
    });
}

// Page 2+: Static
async function loadNextPage() {
    if (ordersUnsubscribe) ordersUnsubscribe(); // Stop real-time updates when going to history

    const lastVisible = lastVisibleSnapshots[currentPage];
    if (!lastVisible) return;

    setLoadingAdmin(true);
    try {
        let q;
        if (currentFilter === 'all') {
            q = query(
                collection(db, "orders"),
                orderBy("timestamp", "desc"),
                startAfter(lastVisible),
                limit(ORDERS_PER_PAGE)
            );
        } else {
            q = query(
                collection(db, "orders"),
                where("status", "==", currentFilter),
                orderBy("timestamp", "desc"),
                startAfter(lastVisible),
                limit(ORDERS_PER_PAGE)
            );
        }

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            currentPage++;
            lastVisibleSnapshots[currentPage] = snapshot.docs[snapshot.docs.length - 1];
            renderOrders(snapshot.docs);
            updatePaginationUI(snapshot.docs.length === ORDERS_PER_PAGE);
            orderCountBadge.textContent = "Geçmiş Siparişler";
        } else {
            updatePaginationUI(false);
        }
    } catch (error) {
        console.error("Pagination Error:", error);
        Swal.fire('Hata', 'Siparişler yüklenemedi.', 'error');
    } finally {
        setLoadingAdmin(false);
    }
}

// Expose updateStatus to window for onclick access
window.updateStatus = async (id, newStatus) => {
    try {
        const orderRef = doc(db, "orders", id);
        await updateDoc(orderRef, {
            status: newStatus
        });
        // Toast notification could be added here
    } catch (error) {
        console.error("Error updating status:", error);
        Swal.fire('Hata', 'Durum güncellenemedi.', 'error');
    }
};

// Clear Delivered Orders Logic
const clearDeliveredBtn = document.getElementById('clearDeliveredBtn');
if (clearDeliveredBtn) {
    clearDeliveredBtn.addEventListener('click', async () => {
        const result = await Swal.fire({
            title: 'Emin misiniz?',
            text: "Teslim edilen tüm siparişler kalıcı olarak silinecek!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Evet, Sil',
            cancelButtonText: 'İptal'
        });

        if (result.isConfirmed) {
            setLoadingAdmin(true);
            try {
                // Query for delivered orders
                const q = query(collection(db, "orders"), where("status", "==", "delivered"));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    Swal.fire('Bilgi', 'Silinecek teslim edilmiş sipariş bulunamadı.', 'info');
                    return;
                }

                // Delete in batch
                const batch = writeBatch(db);
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
                Swal.fire('Silindi!', 'Teslim edilen siparişler temizlendi.', 'success');

                // Refresh list if current filter is 'delivered' or 'all'
                if (currentFilter === 'delivered' || currentFilter === 'all') {
                    listenForOrders();
                }

            } catch (error) {
                console.error("Error clearing orders:", error);
                Swal.fire('Hata', 'Siparişler silinirken bir sorun oluştu.', 'error');
            } finally {
                setLoadingAdmin(false);
            }
        }
    });
}

// --- Tracking Logic ---
const trackBtn = document.getElementById('trackBtn');
const trackingIdInput = document.getElementById('trackingId');
const trackingResult = document.getElementById('trackingResult');
const trackStatus = document.getElementById('trackStatus');
const trackDetails = document.getElementById('trackDetails');
const pasteLastOrderBtn = document.getElementById('pasteLastOrderBtn');
let trackingUnsubscribe = null;

// Paste Last Order Button
if (pasteLastOrderBtn) {
    pasteLastOrderBtn.addEventListener('click', () => {
        const lastId = localStorage.getItem('lastOrderId');
        if (lastId) {
            trackingIdInput.value = lastId;
        } else {
            Swal.fire('Bilgi', 'Kaydedilmiş bir sipariş kodu bulunamadı.', 'info');
        }
    });
}

if (trackBtn) {
    trackBtn.addEventListener('click', async () => {
        const id = trackingIdInput.value.trim();
        if (!id) return;

        // Clear previous listener if exists
        if (trackingUnsubscribe) {
            trackingUnsubscribe();
            trackingUnsubscribe = null;
        }

        try {
            const docRef = doc(db, "orders", id);

            // Real-time listener for tracking
            trackingUnsubscribe = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    trackingResult.classList.remove('d-none');
                    trackStatus.innerHTML = getStatusBadge(data.status);
                    trackDetails.textContent = `${data.block} Blok - ${data.roomNumber}`;
                } else {
                    Swal.fire('Bulunamadı', 'Bu kodla eşleşen bir sipariş bulunamadı.', 'error');
                    trackingResult.classList.add('d-none');
                    if (trackingUnsubscribe) trackingUnsubscribe(); // Stop listening if not found
                }
            }, (error) => {
                console.error("Tracking Error:", error);
                Swal.fire('Hata', 'Takip sırasında bir hata oluştu.', 'error');
            });

        } catch (error) {
            console.error("Tracking Setup Error:", error);
            Swal.fire('Hata', 'Sorgulama başlatılamadı.', 'error');
        }
    });
}
// Filter Buttons Logic
const filterButtons = {
    'all': document.getElementById('filterAllBtn'),
    'pending': document.getElementById('filterPendingBtn'),
    'preparing': document.getElementById('filterPreparingBtn'),
    'on_way': document.getElementById('filterOnWayBtn'),
    'delivered': document.getElementById('filterDeliveredBtn')
};

Object.keys(filterButtons).forEach(status => {
    const btn = filterButtons[status];
    if (btn) {
        btn.addEventListener('click', () => {
            // Update active state
            Object.values(filterButtons).forEach(b => b && b.classList.remove('active', 'btn-dark'));
            Object.values(filterButtons).forEach(b => b && b.classList.add('btn-outline-' + (b.id.includes('Pending') ? 'warning' : b.id.includes('Preparing') ? 'primary' : b.id.includes('OnWay') ? 'info' : b.id.includes('Delivered') ? 'success' : 'secondary')));

            btn.classList.remove('btn-outline-' + (status === 'pending' ? 'warning' : status === 'preparing' ? 'primary' : status === 'on_way' ? 'info' : status === 'delivered' ? 'success' : 'secondary'));
            btn.classList.add('active', 'btn-dark');

            currentFilter = status;
            listenForOrders(); // Reload with new filter
        });
    }

    // --- MAĞAZA DURUM YÖNETİMİ (SHOP SETTINGS) ---

// 1. Mağaza Durumunu Gerçek Zamanlı Dinle (Hem kullanıcı hem admin için)
// Bu kod 'settings' koleksiyonundaki 'shop' dökümanını dinler.
onSnapshot(doc(db, "settings", "shop"), (docSnap) => {
    let isOpen = true; // Varsayılan açık
    let message = "Mesai saatleri dışındayız.";

    if (docSnap.exists()) {
        const data = docSnap.data();
        isOpen = data.isOpen;
        message = data.message || message;
    }

    // Arayüzü Güncelle (Kullanıcı Tarafı)
    if (shopClosedAlert && orderForm) {
        if (isOpen) {
            shopClosedAlert.classList.add('d-none'); // Uyarıyı gizle
            orderForm.classList.remove('d-none');    // Formu göster
        } else {
            shopClosedAlert.classList.remove('d-none'); // Uyarıyı göster
            orderForm.classList.add('d-none');          // Formu gizle
            if (displayClosedMessage) displayClosedMessage.textContent = message;
        }
    }

    // Admin Panelini Güncelle (Eğer açıksa)
    if (shopStatusToggle) {
        shopStatusToggle.checked = isOpen;
        shopStatusLabel.textContent = isOpen ? "AÇIK" : "KAPALI";
        shopStatusLabel.className = isOpen ? "form-check-label fw-bold text-success" : "form-check-label fw-bold text-danger";
        if(shopClosedMessageInput && docSnap.exists()) {
             // Admin inputunu sadece boşsa veya sayfa ilk yüklendiğinde doldur ki yazarken değişmesin
             if(shopClosedMessageInput.value === "") shopClosedMessageInput.value = message;
        }
    }
});

// 2. Admin: Ayarları Kaydetme Fonksiyonu
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const isOpen = shopStatusToggle.checked;
        const message = shopClosedMessageInput.value;

        try {
            await setDoc(doc(db, "settings", "shop"), {
                isOpen: isOpen,
                message: message,
                updatedAt: serverTimestamp()
            });
            
            // Toggle yazısını güncelle
            shopStatusLabel.textContent = isOpen ? "AÇIK" : "KAPALI";
            shopStatusLabel.className = isOpen ? "form-check-label fw-bold text-success" : "form-check-label fw-bold text-danger";

            Swal.fire({
                icon: 'success',
                title: 'Güncellendi',
                text: `Mağaza durumu: ${isOpen ? 'AÇIK' : 'KAPALI'} olarak ayarlandı.`,
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Settings Error:", error);
            Swal.fire('Hata', 'Ayarlar kaydedilemedi.', 'error');
        }
    });
}

});

