const Utils = {
    formatCurrency: (num) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num),
    generateRemissionId: () => 'REM-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100),
    showToast: (msg, type = 'success') => {
        const container = document.getElementById('toast-container');
        // Si no existe el container (ej. en login), crearlo
        if (!container) {
            const body = document.querySelector('body');
            const newContainer = document.createElement('div');
            newContainer.id = 'toast-container';
            body.appendChild(newContainer);
            return Utils.showToast(msg, type); // Reintentar
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> <span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
};

const DEFAULT_USERS = [
    { user: 'Diego', pass: 'admin', role: 'ADMIN', name: 'Diego Admin', warehouse: 'ALL' },
    { user: 'Jonny', pass: 'admin', role: 'ADMIN', name: 'Jonny Admin', warehouse: 'ALL' },
    { user: 'Kate', pass: 'gerente', role: 'GERENTE', name: 'Kate', warehouse: 'ALVAGARA' },
    { user: 'Ronald', pass: 'gerente', role: 'GERENTE', name: 'Ronald', warehouse: 'ALVAGARA' },
    { user: 'Vasnessa', pass: 'gerente', role: 'GERENTE', name: 'Vasnessa', warehouse: 'ALVAGARA' },
    { user: 'Jeison', pass: 'gerente', role: 'GERENTE', name: 'Jeison', warehouse: 'ALVAGARA' },
    { user: 'Liliana', pass: 'gerente', role: 'GERENTE', name: 'Liliana', warehouse: 'Boutique Móvil' },
    { user: 'Manuela', pass: 'empleado', role: 'VENDEDOR', name: 'Manuela', warehouse: 'ALVAGARA' },
    { user: 'Alejandro', pass: 'empleado', role: 'VENDEDOR', name: 'Alejandro', warehouse: 'Boutique Móvil' },
    // NUEVO USUARIO EXTERNO
    { user: 'Externo', pass: '123', role: 'VENDEDOR EXTERNO', name: 'Vendedor Externo', warehouse: 'ALVAGARA' }
];

const DEFAULT_WAREHOUSES = ['ALVAGARA', 'ALVAGARA - OFICINA', 'Boutique Móvil'];

const DB = {
    getUsers: () => {
        const stored = localStorage.getItem('alv_users');
        if(stored) return JSON.parse(stored);
        return DEFAULT_USERS;
    },
    saveUsers: (data) => localStorage.setItem('alv_users', JSON.stringify(data)),
    
    // GESTIÓN DINÁMICA DE ALMACENES
    getWarehouses: () => {
        const stored = localStorage.getItem('alv_warehouses');
        if(stored) return JSON.parse(stored);
        return DEFAULT_WAREHOUSES;
    },
    addWarehouse: (name) => {
        const list = DB.getWarehouses();
        if(list.includes(name)) return false;
        list.push(name);
        localStorage.setItem('alv_warehouses', JSON.stringify(list));
        return true;
    },

    getNotifications: () => JSON.parse(localStorage.getItem('alv_notifications')) || [],
    saveNotifications: (data) => localStorage.setItem('alv_notifications', JSON.stringify(data)),
    addNotification: (targetUser, message) => {
        const notifs = DB.getNotifications();
        const targets = targetUser === 'ADMIN' 
            ? DB.getUsers().filter(u => u.role === 'ADMIN').map(u => u.user)
            : [targetUser];

        targets.forEach(tUser => {
            notifs.push({
                id: Date.now() + Math.random(),
                targetUser: tUser,
                message: message,
                date: new Date().toISOString(),
                read: false
            });
        });
        DB.saveNotifications(notifs);
    },
    // Función para limpiar notificaciones específicas de un serial
    clearNotificationsForSerial: (serial) => {
        let notifs = DB.getNotifications();
        notifs = notifs.filter(n => !n.message.includes(serial)); 
        DB.saveNotifications(notifs);
    },
    markNotificationsRead: (user) => {
        const notifs = DB.getNotifications();
        let changed = false;
        notifs.forEach(n => {
            if(n.targetUser === user && !n.read) {
                n.read = true;
                changed = true;
            }
        });
        if(changed) DB.saveNotifications(notifs);
    },

    getInventory: () => JSON.parse(localStorage.getItem('alv_inventory')) || [],
    saveInventory: (data) => localStorage.setItem('alv_inventory', JSON.stringify(data)),
    getMovements: () => JSON.parse(localStorage.getItem('alv_movements')) || [],
    saveMovements: (data) => localStorage.setItem('alv_movements', JSON.stringify(data)),
    
    getClosingReports: () => JSON.parse(localStorage.getItem('alv_closing_reports')) || [],
    saveClosingReport: (report) => {
        const reports = DB.getClosingReports();
        reports.push(report);
        localStorage.setItem('alv_closing_reports', JSON.stringify(reports));
    },

    getCapital: () => parseFloat(localStorage.getItem('alv_capital')) || 0,
    updateCapital: (amount) => localStorage.setItem('alv_capital', parseFloat(amount)),

    init: () => {
        if (!localStorage.getItem('alv_users')) DB.saveUsers(DEFAULT_USERS);
        if (!localStorage.getItem('alv_inventory')) localStorage.setItem('alv_inventory', JSON.stringify([]));
        if (!localStorage.getItem('alv_movements')) localStorage.setItem('alv_movements', JSON.stringify([]));
        if (!localStorage.getItem('alv_notifications')) localStorage.setItem('alv_notifications', JSON.stringify([]));
        if (!localStorage.getItem('alv_closing_reports')) localStorage.setItem('alv_closing_reports', JSON.stringify([]));
        if (!localStorage.getItem('alv_warehouses')) DB.addWarehouse('ALVAGARA'); // Init default if missing
        if(localStorage.getItem('alv_capital') === null) localStorage.setItem('alv_capital', '0');
    }
};

const app = {
    currentUser: null,
    autoBackupInterval: null,
    fileHandle: null,
    autoBackupEnabled: true,
    cart: [],
    charts: {},
    currentMovementForDetails: null,
    currentClosingData: null,
    currentRequestTab: 'LOAN', // Para manejar pestañas
    blockedItemSerial: null, // Para saber qué item bloquea al usuario

    init: () => {
        DB.init();
        
        // Iniciar verificador de préstamos (cada 1 minuto)
        setInterval(app.checkLoans, 60000);
        app.checkLoans(); // Ejecutar al inicio

        // Detectar en qué página estamos
        const isLoginPage = document.getElementById('login-view') !== null;

        if (isLoginPage) {
            const loginForm = document.getElementById('login-form');
            if(loginForm) loginForm.onsubmit = app.handleLogin;
            
            const logoImg = document.querySelector('.logo img');
            if(logoImg) logoImg.onerror = () => {
                logoImg.style.display = 'none';
                document.getElementById('text-logo').style.display = 'block';
            };
            app.checkSession();
        } else {
            document.getElementById('form-add-item').onsubmit = app.handleAddItem;
            document.getElementById('form-update-status').onsubmit = app.handleUpdateStatus;
            document.getElementById('form-pos-checkout').onsubmit = app.finalizePosSale;
            document.getElementById('form-user').onsubmit = app.handleSaveUser;

            document.getElementById('closing-date').valueAsDate = new Date();

            const toggle = document.getElementById('auto-backup-toggle');
            if(toggle) {
                toggle.addEventListener('change', (e) => {
                    app.autoBackupEnabled = e.target.checked;
                    if(app.autoBackupEnabled && ['ADMIN', 'GERENTE'].includes(app.currentUser?.role)) {
                        app.startAutoBackup();
                        Utils.showToast('Auto-Respaldo Activado');
                    } else {
                        clearInterval(app.autoBackupInterval);
                        Utils.showToast('Auto-Respaldo Desactivado');
                    }
                });
            }
            app.checkSession();
        }
    },

    checkSession: () => {
        const session = sessionStorage.getItem('alv_session');
        const isLoginPage = document.getElementById('login-view') !== null;
        const isDashboardPage = document.getElementById('dashboard-view') !== null;

        if (session) {
            app.currentUser = JSON.parse(session); 
            if (isLoginPage) {
                window.location.href = 'dashboard.html';
            } else if (isDashboardPage) {
                app.loadDashboard(); 
            }
        } else {
            if (isDashboardPage) {
                window.location.href = 'index.html';
            }
        }
    },

    handleLogin: (e) => {
        e.preventDefault();
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        const users = DB.getUsers();
        const userFound = users.find(usr => usr.user === u && usr.pass === p);
        
        if (userFound) {
            // Verificar bloqueo por equipos no devueltos
            const inv = DB.getInventory();
            const isBlocked = inv.some(i => 
                i.loanData && 
                i.loanData.active && 
                i.loanData.requesterUser === userFound.user && 
                i.loanData.notified && 
                !i.loanData.returned && 
                !i.loanData.isSold
            );

            if(isBlocked) {
                Utils.showToast('Tienes una acción pendiente sobre un equipo prestado.', 'error');
            }

            app.currentUser = userFound;
            sessionStorage.setItem('alv_session', JSON.stringify(userFound));
            
            const notifs = DB.getNotifications().filter(n => n.targetUser === u && !n.read);
            if(notifs.length > 0) {
                DB.markNotificationsRead(u);
            }

            window.location.href = 'dashboard.html';
        } else { Utils.showToast('Credenciales incorrectas', 'error'); }
    },

    logout: () => {
        app.currentUser = null; 
        sessionStorage.removeItem('alv_session');
        clearInterval(app.autoBackupInterval); 
        window.location.href = 'index.html';
    },

    loadDashboard: () => {
        const dashboardEl = document.getElementById('dashboard-view');
        if(dashboardEl) dashboardEl.classList.remove('hidden');

        document.getElementById('current-username').textContent = app.currentUser.name;
        document.getElementById('current-role').textContent = app.currentUser.role;
        document.getElementById('current-warehouse').textContent = app.currentUser.warehouse === 'ALL' ? 'TODOS' : app.currentUser.warehouse;

        app.configureSidebar();

        const toggle = document.getElementById('auto-backup-toggle');
        if(toggle) toggle.checked = app.autoBackupEnabled;

        if (app.autoBackupEnabled && ['ADMIN', 'GERENTE'].includes(app.currentUser.role)) app.startAutoBackup();
        
        if(app.currentUser.role === 'VENDEDOR EXTERNO') app.navigate('payments');
        else if(app.currentUser.role === 'VENDEDOR') app.navigate('pos');
        else if(app.currentUser.role === 'GERENTE') app.navigate('closing'); 
        else app.navigate('dashboard');

        // Verificar bloqueo inmediatamente al cargar
        app.checkLoans();
    },

    configureSidebar: () => {
        const role = app.currentUser.role;
        const setVisibility = (id, visible) => {
            const el = document.getElementById(id);
            if(el) {
                if(visible) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        };

        // CONFIGURACIÓN PARA VENDEDOR EXTERNO
        if(role === 'VENDEDOR EXTERNO') {
            setVisibility('nav-dashboard', false);
            setVisibility('nav-settings', false);
            setVisibility('nav-users', false);
            setVisibility('nav-closing', false);
            setVisibility('nav-closing-reports', false);
            setVisibility('nav-remissions', false);
            setVisibility('nav-sales', false);
            setVisibility('nav-requests', false); // Externos piden desde inventario
            
            setVisibility('nav-pos', true);
            setVisibility('nav-inventory', true); 
            setVisibility('nav-payments', true);
            return;
        }

        // Configuración estándar
        setVisibility('nav-dashboard', role === 'ADMIN');
        setVisibility('nav-sales', role === 'ADMIN');
        
        setVisibility('nav-closing', role === 'ADMIN' || role === 'GERENTE');
        setVisibility('nav-remissions', role === 'ADMIN' || role === 'GERENTE');
        setVisibility('nav-closing-reports', role === 'ADMIN');

        setVisibility('nav-users', role === 'ADMIN');

        setVisibility('nav-pos', true);
        setVisibility('nav-inventory', true);
        setVisibility('nav-requests', true);
        setVisibility('nav-settings', true);

        // Pagos visible para Admin también para verificar
        if(role === 'ADMIN') setVisibility('nav-payments', true);

        const btnAdd = document.getElementById('btn-add-item');
        if(btnAdd) {
            if(role === 'VENDEDOR') btnAdd.classList.add('hidden');
            else btnAdd.classList.remove('hidden');
        }
    },

    navigate: (sectionId) => {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const targetSection = document.getElementById(`section-${sectionId}`);
        if(targetSection) targetSection.classList.remove('hidden');
        
        const navItems = document.querySelectorAll('.nav-item');
        const indexMap = { 'dashboard': 0, 'pos': 1, 'inventory': 2, 'requests': 3, 'remissions': 4, 'closing': 5, 'closing-reports': 6, 'users': 7, 'sales': 8, 'settings': 9, 'payments': 10 };
        if(navItems[indexMap[sectionId]]) navItems[indexMap[sectionId]].classList.add('active');

        const titles = { 
            'dashboard': 'Dashboard', 
            'pos': 'Punto de Venta', 
            'inventory': 'Inventario Multi-Almacén', 
            'requests': 'Solicitudes de Préstamo',
            'remissions': 'Historial de Remisiones',
            'closing': 'Cierre de Caja Diario',
            'closing-reports': 'Reportes de Caja Recibidos',
            'users': 'Gestión de Usuarios',
            'sales': 'Ventas y Reportes', 
            'settings': 'Configuración',
            'payments': 'Pagos'
        };
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = titles[sectionId];

        if(window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar) sidebar.classList.remove('active');
        }

        if (sectionId === 'inventory') app.renderInventory();
        if (sectionId === 'sales') app.renderSales();
        if (sectionId === 'dashboard') app.renderDashboard();
        if (sectionId === 'pos') app.renderPOS();
        if (sectionId === 'requests') app.renderRequests();
        if (sectionId === 'users') app.renderUsers();
        if (sectionId === 'closing') app.loadClosingData();
        if (sectionId === 'remissions') app.renderRemissions();
        if (sectionId === 'closing-reports') app.renderClosingReports();
        if (sectionId === 'settings') app.renderSettings();
        if (sectionId === 'payments') app.renderPayments();
    },

    // --- LÓGICA DE BLOQUEO Y PRÉSTAMOS ---

    checkLoans: () => {
        const now = Date.now();
        const inv = DB.getInventory();
        const movements = DB.getMovements();
        let changed = false;

        // 1. Verificar si hay préstamos vencidos
        inv.forEach(item => {
            if(item.loanData && item.loanData.active && item.loanData.type === 'LOAN' && !item.loanData.returned && !item.loanData.isSold) {
                if(now > item.loanData.expiryTime && !item.loanData.notified) {
                    item.loanData.notified = true;
                    changed = true;
                    
                    const movement = movements.find(m => m.serial === item.serial && m.type === 'LOAN');
                    const msg = movement 
                        ? `¡TIEMPO AGOTADO! El usuario ${item.loanData.requesterName} no devolvió ${item.serial}.` 
                        : `Préstamo vencido: ${item.serial} por ${item.loanData.requesterName}.`;
                    
                    DB.addNotification('ADMIN', msg);
                }
            }
        });

        if(changed) DB.saveInventory(inv);
        
        // 2. Verificar si el usuario actual está bloqueado para mostrar pantalla
        const invFresh = DB.getInventory();
        const blockedItem = invFresh.find(i => 
            i.loanData && 
            i.loanData.active && 
            i.loanData.type === 'LOAN' &&
            i.loanData.requesterUser === app.currentUser?.user && 
            i.loanData.notified && 
            !i.loanData.returned && 
            !i.loanData.isSold
        );

        const overlay = document.getElementById('user-blocked-overlay');
        if(overlay) {
            if(blockedItem) {
                overlay.classList.remove('hidden');
                app.blockedItemSerial = blockedItem.serial; 
            } else {
                overlay.classList.add('hidden');
                app.blockedItemSerial = null;
            }
        }
    },

    handleBlockedReturn: () => {
        if(!confirm("¿Confirmas que físicamente devolviste el equipo al almacén?")) return;
        
        const inv = DB.getInventory();
        const idx = inv.findIndex(i => i.serial === app.blockedItemSerial);
        if(idx !== -1) {
            const item = inv[idx];
            item.status = 'EN_INVENTORY';
            item.loanData.active = false;
            item.loanData.returned = true;
            
            DB.clearNotificationsForSerial(item.serial);
            
            DB.saveInventory(inv);
            Utils.showToast('Equipo devuelto correctamente. Usuario reactivado.');
            location.reload();
        }
    },

    openBlockedSaleModal: () => {
        if(!app.blockedItemSerial) return;
        const item = DB.getInventory().find(i => i.serial === app.blockedItemSerial);
        if(!item) return;

        document.getElementById('late-sale-serial').value = item.serial;
        document.getElementById('late-sale-client').value = '';
        document.getElementById('late-sale-price').value = Math.floor(item.cost * 1.3);
        
        app.openModal('late-sale');
    },

    submitBlockedSale: (e) => {
        e.preventDefault();
        const serial = document.getElementById('late-sale-serial').value;
        const client = document.getElementById('late-sale-client').value;
        const price = parseFloat(document.getElementById('late-sale-price').value);
        const method = document.getElementById('late-sale-method').value;

        const inv = DB.getInventory();
        const idx = inv.findIndex(i => i.serial === serial);
        
        if(idx !== -1) {
            const item = inv[idx];
            
            item.status = 'VENDIDO_PENDIENTE'; // NUEVO ESTADO
            item.loanData.active = false;
            item.loanData.returned = true;
            item.loanData.isSold = true;
            item.soldBy = app.currentUser.user;
            
            // Generar Deuda
            item.paymentStatus = {
                total: price,
                paid: 0,
                debt: price
            };

            const movements = DB.getMovements();
            movements.push({
                id: Date.now(),
                date: new Date().toISOString(),
                type: 'SALE',
                serial: item.serial,
                brand: item.brand,
                model: item.model,
                cost: item.cost,
                salePrice: price,
                profit: price - item.cost,
                buyerName: client,
                paymentMethod: method,
                user: app.currentUser.user,
                userName: app.currentUser.name,
                warehouse: app.currentUser.warehouse,
                isExternal: app.currentUser.role === 'VENDEDOR EXTERNO',
                lateSale: true
            });
            DB.saveMovements(movements);
            
            DB.clearNotificationsForSerial(item.serial);

            DB.saveInventory(inv);
            Utils.showToast('Venta tardía registrada y deuda generada.');
            location.reload();
        }
    },

    // --- MANEJO DE SOLICITUDES ---
    
    switchRequestsTab: (type) => {
        app.currentRequestTab = type;
        document.getElementById('tab-loans').classList.remove('active');
        document.getElementById('tab-transfers').classList.remove('active');
        document.getElementById(`tab-${type.toLowerCase()}`).classList.add('active');
        app.renderRequests();
    },

    requestItem: (serial) => {
        let reqType;
        
        if(app.currentUser.role === 'VENDEDOR EXTERNO') {
            reqType = 'LOAN';
        } else {
            const type = prompt("Tipo de solicitud:\n1. PRÉSTAMO (2 Horas)\n2. TRASLADO (Permanente)\n\nEscribe 1 o 2:");
            if(!type || (type !== '1' && type !== '2')) return;
            reqType = type === '1' ? 'LOAN' : 'TRANSFER';
        }
        
        const inv = DB.getInventory();
        const idx = inv.findIndex(i => i.serial === serial);
        if(idx === -1) return;

        const expiry = reqType === 'LOAN' ? Date.now() + (2 * 60 * 60 * 1000) : null;

        inv[idx].request = {
            status: 'REQUESTED',
            type: reqType, 
            expiryTime: expiry, 
            requesterUser: app.currentUser.user,
            requesterName: app.currentUser.name,
            requesterWarehouse: app.currentUser.warehouse,
            date: new Date().toISOString()
        };
        DB.saveInventory(inv);
        Utils.showToast(`Solicitud ${reqType === 'LOAN' ? 'de Préstamo' : 'de Traslado'} enviada.`);
        app.renderInventory();
    },

    resolveRequest: (serial, approved) => {
        const inv = DB.getInventory();
        const idx = inv.findIndex(i => i.serial === serial);
        if(idx === -1) return;

        const req = inv[idx].request;

        if(approved) {
            const item = inv[idx];
            const movements = DB.getMovements();
            const remissionId = Utils.generateRemissionId();

            let newStatus = 'PRESTADO'; 
            let noteType = 'LOAN';
            let movementType = 'LOAN';
            
            if(req.type === 'TRANSFER') {
                newStatus = 'TRASLADO_EMPRESA'; 
                noteType = 'REMISION';
                movementType = 'REMISION';
                Utils.showToast('Traslado aprobado. Equipos asignados.');
            } else {
                Utils.showToast(`Préstamo aprobado. Tiempo: 2 horas.`);
            }

            inv[idx].status = newStatus;
            
            inv[idx].loanData = {
                active: true,
                type: req.type,
                expiryTime: req.expiryTime,
                returned: false,
                isSold: false,
                notified: false,
                requesterUser: req.requesterUser,
                originalWarehouse: item.warehouse 
            };

            movements.push({
                id: Date.now(),
                date: new Date().toISOString(),
                type: movementType,
                remissionId: remissionId,
                user: app.currentUser.user,
                userName: app.currentUser.name,
                fromWarehouse: item.warehouse, 
                toWarehouse: req.requesterWarehouse,
                requesterName: req.requesterName,
                items: [ { serial: item.serial, brand: item.brand, model: item.model, cost: item.cost } ],
                notes: req.type === 'LOAN' ? `Préstamo activo hasta ${new Date(req.expiryTime).toLocaleTimeString()}` : `Traslado a empresa`
            });
            DB.saveMovements(movements);

            inv[idx].request.status = 'APPROVED';
            
        } else {
            inv[idx].request.status = 'REJECTED';
            delete inv[idx].request; 
            Utils.showToast('Solicitud Rechazada.', 'error');
        }
        DB.saveInventory(inv);
        app.renderInventory();
        app.renderRequests();
    },

    renderRequests: () => {
        const inv = DB.getInventory();
        const tbody = document.getElementById('requests-table-body');
        tbody.innerHTML = '';
        
        const userWh = app.currentUser.warehouse;
        const role = app.currentUser.role;
        
        const myRequestedItems = inv.filter(item => {
            if(item.request?.status !== 'REQUESTED') return false;
            if(item.request.type !== app.currentRequestTab) return false;
            
            if(role === 'ADMIN') return true; 
            return item.warehouse === userWh;
        });

        if(myRequestedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#777;">No hay solicitudes de ${app.currentRequestTab === 'LOAN' ? 'Préstamo' : 'Traslado'} pendientes.</td></tr>`;
            return;
        }

        myRequestedItems.forEach(item => {
            const tr = document.createElement('tr');
            const reqDate = new Date(item.request.date).toLocaleString();
            
            tr.innerHTML = `
                <td data-label="Fecha">${reqDate}</td>
                <td data-label="Solicitante">${item.request.requesterName}</td>
                <td data-label="Almacén Sol">${item.request.requesterWarehouse || item.request.requesterUser}</td>
                <td data-label="Equipo">${item.brand} ${item.model}</td>
                <td data-label="Serial">${item.serial}</td>
                <td data-label="Estado"><span class="badge REQUESTED">Pendiente (${item.request.type === 'LOAN' ? 'Préstamo' : 'Traslado'})</span></td>
                <td data-label="Acciones">
                    <button class="action-btn success" onclick="app.resolveRequest('${item.serial}', true)" title="Aprobar"><i class="fas fa-check"></i></button>
                    <button class="action-btn danger" onclick="app.resolveRequest('${item.serial}', false)" title="Rechazar"><i class="fas fa-times"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- FIN SECCIÓN PRÉSTAMOS ---

    loadClosingData: () => {
        document.getElementById('closing-result-box').style.display = 'none';
        document.getElementById('closing-discrepancy-report').classList.add('hidden');
        document.getElementById('close-cash-physical').value = '';
        document.getElementById('close-nequi-physical').value = '';
        document.getElementById('close-card-physical').value = '';
        document.getElementById('close-observations').value = '';
        
        const dateStr = document.getElementById('closing-date').value; 
        const userWh = app.currentUser.warehouse;
        const movements = DB.getMovements();

        const expected = { EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA_CREDITO: 0, count: 0 };
        
        movements.forEach(m => {
            // Solo ventas NO EXTERNAS o Externas ya pagadas totalmente (VENDIDO definitivo)
            const isFullyPaid = m.isExternal && (DB.getInventory().find(i=>i.serial===m.serial)?.status === 'VENDIDO');
            const isNormalSale = !m.isExternal;

            if(m.newStatus === 'VENDIDO' && (isNormalSale || isFullyPaid) && m.date.startsWith(dateStr) && (userWh === 'ALL' || m.warehouse === userWh)) {
                expected[m.paymentMethod] = (expected[m.paymentMethod] || 0) + m.salePrice;
                expected.count++;
            }
        });

        app.currentClosingData = { expected, dateStr, userWh };

        const container = document.getElementById('closing-comparison-area');
        container.innerHTML = `
            <table style="width:100%; font-size: 0.9rem;">
                <thead>
                    <tr style="background:#f8f9fa;">
                        <th style="text-align:left; padding:8px;">Método</th>
                        <th style="text-align:right; padding:8px;">Sistema</th>
                        <th style="text-align:right; padding:8px;">Físico (Ingresar)</th>
                        <th style="text-align:right; padding:8px;">Diferencia</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:10px;"><i class="fas fa-money-bill" style="color:#2ecc71; margin-right:5px;"></i> Efectivo</td>
                        <td style="text-align:right; font-weight:bold;">${Utils.formatCurrency(expected.EFECTIVO)}</td>
                        <td style="text-align:right; color:#aaa;">(Ver formulario)</td>
                        <td style="text-align:right;" id="diff-EFECTIVO">-</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;"><i class="fas fa-mobile-alt" style="color:#3498db; margin-right:5px;"></i> Nequi/Transf.</td>
                        <td style="text-align:right; font-weight:bold;">${Utils.formatCurrency(expected.TRANSFERENCIA)}</td>
                        <td style="text-align:right; color:#aaa;">(Ver formulario)</td>
                        <td style="text-align:right;" id="diff-TRANSFERENCIA">-</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;"><i class="fas fa-credit-card" style="color:#9b59b6; margin-right:5px;"></i> Datafono</td>
                        <td style="text-align:right; font-weight:bold;">${Utils.formatCurrency(expected.TARJETA_CREDITO)}</td>
                        <td style="text-align:right; color:#aaa;">(Ver formulario)</td>
                        <td style="text-align:right;" id="diff-TARJETA_CREDITO">-</td>
                    </tr>
                    <tr style="border-top: 2px solid #eee;">
                        <td style="padding:10px; font-weight:bold;">TOTALES</td>
                        <td style="text-align:right; font-weight:bold;">${Utils.formatCurrency(expected.EFECTIVO + expected.TRANSFERENCIA + expected.TARJETA_CREDITO)}</td>
                        <td style="text-align:right; color:#aaa;">-</td>
                        <td style="text-align:right; font-weight:bold;" id="diff-TOTAL">-</td>
                    </tr>
                </tbody>
            </table>
            <div class="text-sm" style="margin-top:10px; text-align:center; color:#777;">
                Ventas Registradas: ${expected.count}
            </div>
        `;
    },

    processCashClose: () => {
        const physicalCash = parseFloat(document.getElementById('close-cash-physical').value) || 0;
        const physicalNequi = parseFloat(document.getElementById('close-nequi-physical').value) || 0;
        const physicalCard = parseFloat(document.getElementById('close-card-physical').value) || 0;
        const observations = document.getElementById('close-observations').value;

        const { expected, dateStr, userWh } = app.currentClosingData;
        
        const physical = { EFECTIVO: physicalCash, TRANSFERENCIA: physicalNequi, TARJETA_CREDITO: physicalCard };
        const diffs = {
            EFECTIVO: expected.EFECTIVO - physical.EFECTIVO,
            TRANSFERENCIA: expected.TRANSFERENCIA - physical.TRANSFERENCIA,
            TARJETA_CREDITO: expected.TARJETA_CREDITO - physical.TARJETA_CREDITO
        };
        
        const totalDiff = diffs.EFECTIVO + diffs.TRANSFERENCIA + diffs.TARJETA_CREDITO;

        const updateDiffUI = (method, val) => {
            const el = document.getElementById(`diff-${method}`);
            if(!el) return;
            const color = val > 0 ? 'red' : (val < 0 ? 'green' : 'black');
            const text = val > 0 ? `Faltan: ${Utils.formatCurrency(val)}` : (val < 0 ? `Sobran: ${Utils.formatCurrency(Math.abs(val))}` : 'Cuadra');
            el.innerHTML = `<span style="color:${color}; font-weight:bold;">${text}</span>`;
        };

        updateDiffUI('EFECTIVO', diffs.EFECTIVO);
        updateDiffUI('TRANSFERENCIA', diffs.TRANSFERENCIA);
        updateDiffUI('TARJETA_CREDITO', diffs.TARJETA_CREDITO);
        updateDiffUI('TOTAL', totalDiff);

        const resultBox = document.getElementById('closing-result-box');
        resultBox.style.display = 'block';
        const reportBox = document.getElementById('closing-discrepancy-report');
        const reportText = document.getElementById('discrepancy-text');

        if (totalDiff === 0) {
            resultBox.className = 'closing-status-box status-match';
            resultBox.innerHTML = `<i class="fas fa-check-circle"></i> ¡Caja Perfecta! Enviando reporte al Admin...`;
            reportBox.classList.add('hidden');
            
            const report = {
                date: new Date().toISOString(),
                closingDate: dateStr,
                warehouse: userWh,
                user: app.currentUser.user,
                status: 'OK',
                details: { expected, physical, diffs }
            };
            DB.saveClosingReport(report);
            DB.addNotification('ADMIN', `Cierre de Caja perfecto en ${userWh} (${dateStr})`);
            Utils.showToast('Reporte enviado al Administrador');

        } else {
            resultBox.className = 'closing-status-box status-diff';
            resultBox.innerHTML = `<i class="fas fa-times-circle"></i> Incongruencia Detectada`;
            reportBox.classList.remove('hidden');

            let analysis = `Diferencia total: ${Utils.formatCurrency(Math.abs(totalDiff))}.<br>`;
            if (totalDiff > 0) {
                analysis += `Falta dinero en caja. Esto puede indicar:<br>`;
                analysis += `1. Error en conteo físico.<br>`;
                analysis += `2. Venta realizada pero NO registrada en el sistema (Robo o venta 'por fuera').<br>`;
                analysis += `3. Pérdida de efectivo.`;
            } else {
                analysis += `Sobra dinero en caja. Posible error en ingreso de datos o venta doblemente registrada.`;
            }
            reportText.innerHTML = analysis;

            const report = {
                date: new Date().toISOString(),
                closingDate: dateStr,
                warehouse: userWh,
                user: app.currentUser.user,
                status: 'DISCREPANCY',
                totalDifference: totalDiff,
                observations: observations,
                details: { expected, physical, diffs }
            };
            DB.saveClosingReport(report);
            DB.addNotification('ADMIN', `Incongruencia en Cierre de Caja ${userWh} (${dateStr}): ${Utils.formatCurrency(Math.abs(totalDiff))}`);
            Utils.showToast('Reporte de discrepancia generado y enviado.', 'error');
        }
    },

    renderClosingReports: () => {
        const reports = DB.getClosingReports();
        const tbody = document.getElementById('closing-reports-body');
        tbody.innerHTML = '';

        if(reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#777;">No hay reportes recibidos aún.</td></tr>';
            return;
        }

        const sorted = [...reports].sort((a,b) => new Date(b.date) - new Date(a.date));

        sorted.forEach(r => {
            const tr = document.createElement('tr');
            const statusBadge = r.status === 'OK' 
                ? `<span class="badge OK">Perfecto</span>` 
                : `<span class="badge DISCREPANCY">Incongruencia</span>`;
            
            const diffText = r.totalDifference === 0 
                ? '-' 
                : `<span style="color:${r.totalDifference > 0 ? 'red' : 'green'}; font-weight:bold;">${Utils.formatCurrency(r.totalDifference)}</span>`;

            tr.innerHTML = `
                <td>${r.closingDate}</td>
                <td><strong>${r.warehouse}</strong></td>
                <td>${r.user}</td>
                <td>${statusBadge}</td>
                <td>${diffText}</td>
                <td>
                    <div class="flex" style="gap:5px;">
                        <button class="action-btn secondary" onclick="alert('Obs: ${r.observations || 'Sin observaciones'}')">Ver Obs</button>
                        <button class="action-btn" style="background:#3498db" onclick="app.viewClosingDetails('${r.closingDate}')"><i class="fas fa-eye"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    viewClosingDetails: (reportDateStr) => {
        const report = DB.getClosingReports().find(r => r.closingDate === reportDateStr);
        if(!report) return;

        const content = document.getElementById('remission-details-content');
        const modal = document.getElementById('modal-remission-details');
        document.querySelector('#modal-remission-details h3').textContent = "Detalle Caja y Validación";
        
        const headerActions = modal.querySelector('.modal-actions');
        const oldBtn = document.getElementById('btn-validate-closing');
        if(oldBtn) oldBtn.remove();

        const validateBtn = document.createElement('button');
        validateBtn.id = 'btn-validate-closing';
        validateBtn.className = 'action-btn success';
        validateBtn.textContent = 'Marcar Cierre como CORRECTO';
        validateBtn.onclick = () => {
            if(confirm('¿Confirma que el cierre de caja es correcto tras revisar las observaciones y el monto a recoger?')) {
                Utils.showToast('Caja validada correctamente.');
                app.closeModal('remission-details');
                validateBtn.remove();
            }
        };
        headerActions.appendChild(validateBtn);

        content.innerHTML = `
            <h4>Datos del Cierre</h4>
            <p><strong>Fecha:</strong> ${report.closingDate}</p>
            <p><strong>Almacén:</strong> ${report.warehouse}</p>
            <p><strong>Diferencia:</strong> ${Utils.formatCurrency(report.totalDifference)}</p>
            <p><strong>Observaciones:</strong> ${report.observations || 'Ninguna'}</p>
            
            <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-top:15px;">
                <h4><i class="fas fa-coins"></i> Monto a Recoger (Dinero Físico)</h4>
                <p>Según el reporte, debe haber:</p>
                <ul>
                    <li>Efectivo: ${Utils.formatCurrency(report.details.physical.EFECTIVO)}</li>
                    <li>Transf: ${Utils.formatCurrency(report.details.physical.TRANSFERENCIA)}</li>
                    <li>Datafono: ${Utils.formatCurrency(report.details.physical.TARJETA_CREDITO)}</li>
                </ul>
                <strong>Total Recoger: ${Utils.formatCurrency(report.details.physical.EFECTIVO + report.details.physical.TRANSFERENCIA + report.details.physical.TARJETA_CREDITO)}</strong>
            </div>
        `;
        app.openModal('remission-details');
    },

    renderRemissions: () => {
        const movements = DB.getMovements();
        const userWh = app.currentUser.warehouse;
        const role = app.currentUser.role;
        
        const remissions = movements.filter(m => m.type === 'REMISION' || m.type === 'LOAN');
        
        const tbody = document.getElementById('remissions-table-body');
        tbody.innerHTML = '';

        if(remissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#777;">No hay remisiones registradas.</td></tr>';
            return;
        }

        const visibleRemissions = remissions.filter(r => {
            if (role === 'ADMIN') return true;
            if (r.fromWarehouse === userWh || r.toWarehouse === userWh) return true;
            return false;
        });

        visibleRemissions.forEach(r => {
            const tr = document.createElement('tr');
            const date = new Date(r.date).toLocaleDateString();
            tr.innerHTML = `
                <td><span class="badge REMISION">${r.remissionId}</span></td>
                <td>${date}</td>
                <td>${r.fromWarehouse}</td>
                <td>${r.toWarehouse}</td>
                <td>${r.requesterName || r.userName || 'N/A'}</td>
                <td>${r.items.length} Equipo(s)</td>
                <td>
                    <button class="action-btn secondary" onclick="app.openRemissionDetails(${r.id})">
                        <i class="fas fa-eye"></i> Ver Detalles
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openRemissionDetails: (id) => {
        const movement = DB.getMovements().find(m => m.id === id);
        if (!movement) return;

        const content = document.getElementById('remission-details-content');
        let itemsHtml = '';
        (movement.items || []).forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.brand} ${item.model}</td>
                    <td>${item.serial}</td>
                    <td>${Utils.formatCurrency(item.cost)}</td>
                </tr>
            `;
        });

        content.innerHTML = `
            <div class="flex gap-2" style="margin-bottom:20px;">
                <div>
                    <span style="color:#777; font-size:0.8rem;">ID Remisión</span>
                    <div style="font-weight:bold; font-size:1.1rem;">${movement.remissionId}</div>
                </div>
                <div>
                    <span style="color:#777; font-size:0.8rem;">Fecha</span>
                    <div style="font-weight:bold;">${new Date(movement.date).toLocaleString()}</div>
                </div>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; background:#f9f9f9; padding:15px; border-radius:8px;">
                <div>
                    <span style="color:#777; font-size:0.8rem;">De Almacén</span>
                    <div style="font-weight:bold;">${movement.fromWarehouse}</div>
                </div>
                <div>
                    <span style="color:#777; font-size:0.8rem;">A Almacén</span>
                    <div style="font-weight:bold;">${movement.toWarehouse}</div>
                </div>
                <div>
                    <span style="color:#777; font-size:0.8rem;">Solicitado Por</span>
                    <div style="font-weight:bold;">${movement.requesterName || movement.userName}</div>
                </div>
                 <div>
                    <span style="color:#777; font-size:0.8rem;">Aprobado Por</span>
                    <div style="font-weight:bold;">${movement.userName}</div>
                </div>
            </div>

            <h4 style="margin-bottom:10px;">Equipos Enviados</h4>
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:#eee;">
                        <th style="padding:8px;">Equipo</th>
                        <th style="padding:8px;">Serial</th>
                        <th style="padding:8px;">Costo</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            ${movement.notes ? `<div style="margin-top:15px; padding:10px; background:#fff3e0; border-radius:8px;"><strong>Observaciones:</strong> ${movement.notes}</div>` : ''}
        `;
        app.openModal('remission-details');
    },

    renderSettings: () => {
        const cap = DB.getCapital();
        const card = document.getElementById('admin-settings-card');
        const capitalText = document.getElementById('settings-current-capital');

        if(app.currentUser.role === 'ADMIN') {
            card.classList.remove('hidden');
            capitalText.textContent = Utils.formatCurrency(cap);

            // Renderizar lista de almacenes
            const whList = document.getElementById('warehouses-list');
            whList.innerHTML = '';
            DB.getWarehouses().forEach(wh => {
                const li = document.createElement('li');
                li.innerHTML = `<i class="fas fa-warehouse" style="color:#555; margin-right:5px;"></i> ${wh}`;
                whList.appendChild(li);
            });
            
            document.getElementById('admin-warehouses-card').classList.remove('hidden');
        } else {
            card.classList.add('hidden');
            document.getElementById('admin-warehouses-card').classList.add('hidden');
        }
    },

    handleCapitalAdjustment: (e) => {
        e.preventDefault();
        const val = parseFloat(document.getElementById('new-capital-input').value);
        if(isNaN(val) || val < 0) return;
        
        DB.updateCapital(val);
        Utils.showToast('Capital actualizado correctamente');
        app.closeModal('admin-capital');
        app.renderSettings();
        app.renderDashboard(); 
    },

    addWarehouse: () => {
        const name = document.getElementById('new-warehouse-name').value.trim();
        if(!name) return;
        if(DB.addWarehouse(name)) {
            Utils.showToast('Almacén creado exitosamente');
            document.getElementById('new-warehouse-name').value = '';
            app.renderSettings();
        } else {
            Utils.showToast('El almacén ya existe', 'error');
        }
    },

    renderUsers: () => {
        const users = DB.getUsers();
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.user}</strong></td>
                <td>${u.name}</td>
                <td><span class="badge" style="background:#eee; color:#333;">${u.role}</span></td>
                <td>${u.warehouse === 'ALL' ? '<span style="color:#d35400; font-weight:bold;">TODOS</span>' : u.warehouse}</td>
                <td>
                    <button class="action-btn secondary" onclick="app.openUserModal('${u.user}')"><i class="fas fa-edit"></i></button>
                    ${u.user !== 'Diego' && u.user !== 'Jonny' ? `<button class="action-btn danger" onclick="app.deleteUser('${u.user}')"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openUserModal: (editUser = null) => {
        const form = document.getElementById('form-user');
        form.reset();
        
        const whSelect = document.getElementById('user-warehouse');
        const warning = document.getElementById('warehouse-change-warning');

        // Llenar almacenes dinámicamente
        whSelect.innerHTML = '';
        whSelect.innerHTML += `<option value="ALL">TODOS (Admin)</option>`;
        DB.getWarehouses().forEach(wh => {
            whSelect.innerHTML += `<option value="${wh}">${wh}</option>`;
        });

        if(editUser) {
            const u = DB.getUsers().find(x => x.user === editUser);
            document.getElementById('user-original').value = u.user;
            document.getElementById('user-login').value = u.user;
            document.getElementById('user-login').disabled = true; 
            document.getElementById('user-name').value = u.name;
            document.getElementById('user-pass').placeholder = "Dejar vacío para mantener";
            document.getElementById('user-role').value = u.role;
            whSelect.value = u.warehouse;
        } else {
            document.getElementById('user-original').value = '';
            document.getElementById('user-login').disabled = false;
            document.getElementById('user-pass').required = true;
            whSelect.value = 'ALVAGARA'; 
        }
        warning.classList.add('hidden');
        app.openModal('user-form');
    },

    handleSaveUser: (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const originalUser = formData.get('originalUser');
        const user = formData.get('user');
        const name = formData.get('name');
        const pass = formData.get('pass');
        const role = formData.get('role');
        const warehouse = formData.get('warehouse');
        
        let users = DB.getUsers();
        
        if(originalUser) {
            const idx = users.findIndex(u => u.user === originalUser);
            if(idx !== -1) {
                const oldWh = users[idx].warehouse;
                const newWh = warehouse;
                
                users[idx].name = name;
                users[idx].role = role;
                users[idx].warehouse = warehouse;
                if(pass) users[idx].pass = pass;

                if(oldWh !== newWh && role !== 'ADMIN') {
                    DB.addNotification(user, `Has sido trasladado al almacén: ${newWh}`);
                }
                
                Utils.showToast('Usuario actualizado');
            }
        } else {
            if(users.find(u => u.user === user)) {
                Utils.showToast('El usuario ya existe', 'error');
                return;
            }
            users.push({ user, pass, role, name, warehouse });
            Utils.showToast('Usuario creado');
        }
        
        DB.saveUsers(users);
        app.closeModal('user-form');
        app.renderUsers();
    },

    deleteUser: (username) => {
        if(!confirm('¿Estás seguro de eliminar este usuario?')) return;
        let users = DB.getUsers();
        users = users.filter(u => u.user !== username);
        DB.saveUsers(users);
        app.renderUsers();
        Utils.showToast('Usuario eliminado');
    },

    renderDashboard: () => {
        const inv = DB.getInventory();
        const movements = DB.getMovements();
        const userWh = app.currentUser.warehouse;
        const myInv = userWh === 'ALL' ? inv : inv.filter(i => i.warehouse === userWh);
        
        let totalRevenue = 0, totalProfit = 0;
        const today = new Date().toISOString().split('T')[0];
        let profitToday = 0;
        const paymentStats = { EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA_CREDITO: 0 };

        movements.forEach(m => {
            // Solo ventas definidas como VENDIDO (ya pagadas o internas)
            if (m.newStatus === 'VENDIDO' && (userWh === 'ALL' || m.warehouse === userWh)) {
                totalRevenue += m.salePrice;
                totalProfit += m.profit;
                if (m.date.startsWith(today)) profitToday += m.profit;
                
                if(m.paymentMethod) {
                    if(paymentStats[m.paymentMethod] !== undefined) paymentStats[m.paymentMethod] += m.salePrice;
                }
            }
        });

        const totalCost = myInv.reduce((sum, i) => sum + (i.cost || 0), 0);
        const totalStock = myInv.filter(i => i.status === 'EN_INVENTORY').length;
        
        const totalPending = userWh === 'ALL' 
            ? inv.filter(i => i.request?.status === 'REQUESTED').length 
            : inv.filter(i => i.warehouse === userWh && i.request?.status === 'REQUESTED').length;

        const kpiRevenue = document.getElementById('kpi-revenue');
        if(kpiRevenue) kpiRevenue.textContent = Utils.formatCurrency(totalRevenue);
        
        const kpiProfit = document.getElementById('kpi-profit');
        if(kpiProfit) kpiProfit.textContent = Utils.formatCurrency(totalProfit);
        
        const kpiStock = document.getElementById('kpi-stock');
        if(kpiStock) kpiStock.textContent = totalStock;

        const kpiRequests = document.getElementById('kpi-requests');
        if(kpiRequests) kpiRequests.textContent = totalPending;

        const capCard = document.getElementById('card-capital');
        if(capCard) {
            if(app.currentUser.role === 'ADMIN') {
                capCard.classList.remove('hidden');
                document.getElementById('kpi-capital').textContent = Utils.formatCurrency(DB.getCapital());
            } else {
                capCard.classList.add('hidden');
            }
        }

        const ctxP = document.getElementById('chart-payment');
        if(ctxP) {
            if(app.charts.payment) app.charts.payment.destroy();
            app.charts.payment = new Chart(ctxP.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Efectivo', 'Transferencia', 'Tarjeta'],
                    datasets: [{ data: [paymentStats.EFECTIVO, paymentStats.TRANSFERENCIA, paymentStats.TARJETA_CREDITO], backgroundColor: ['#2ecc71', '#3498db', '#9b59b6'] }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    },

    renderPOS: () => {
        const inv = DB.getInventory();
        const userWh = app.currentUser.warehouse;
        const grid = document.getElementById('pos-grid');
        grid.innerHTML = '';
        
        const available = inv.filter(item => {
            const isApprovedForMe = item.request?.status === 'APPROVED' && item.request.requesterUser === app.currentUser.user;
            const isMyWarehouseStock = item.warehouse === userWh && item.status === 'EN_INVENTORY';
            
            // Externos ven items prestados activos
            const isMyActiveLoan = item.status === 'PRESTADO' && 
                                   item.loanData?.active && 
                                   item.loanData?.requesterUser === app.currentUser.user;

            // Bloqueo: Internos NO ven items prestados a otros
            if(app.currentUser.role !== 'VENDEDOR EXTERNO' && item.status === 'PRESTADO' && !isMyActiveLoan) return false;

            if(app.currentUser.role === 'VENDEDOR EXTERNO') {
                return isMyWarehouseStock || isApprovedForMe || isMyActiveLoan;
            } else {
                return isMyWarehouseStock || isApprovedForMe || isMyActiveLoan;
            }
        });

        if(available.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#777;">No hay productos disponibles en tu almacén.</p>';
        }

        available.forEach(item => {
            const isMyWarehouse = item.warehouse === userWh;
            const card = document.createElement('div');
            card.className = 'product-card';
            
            let badge = '';
            if(item.status === 'PRESTADO' && item.loanData?.requesterUser === app.currentUser.user) {
                badge = `<span class="product-wh-warehouse" style="background:#e67e22; color:white;">PRESTADO (VENDER AHORA)</span>`;
            } else if (!isMyWarehouse && item.request?.status === 'APPROVED') {
                badge = `<span class="product-wh-warehouse" style="background:#e8f5e9; color:#2e7d32;">Aprobado</span>`;
            } else {
                badge = `<span class="product-wh-warehouse" style="background:#e3f2fd; color:#1976d2;">${item.warehouse}</span>`;
            }

            const suggested = Math.floor(item.cost * 1.3);
            
            card.innerHTML = `
                <i class="fas fa-mobile-alt" style="font-size: 2rem; color: #53515a; margin-bottom: 10px;"></i>
                <h4>${item.brand} ${item.model}</h4>
                <small style="color:#888">${item.serial}</small>
                <div class="product-price">${Utils.formatCurrency(suggested)}</div>
                ${badge}
            `;
            card.onclick = () => app.openPosPriceModal(item);
            grid.appendChild(card);
        });
        app.renderCart();
    },

    openPosPriceModal: (item) => {
        const suggested = Math.floor(item.cost * 1.3);
        document.getElementById('pos-temp-serial').value = item.serial;
        document.getElementById('pos-temp-price').value = suggested;
        document.getElementById('modal-pos-desc').textContent = `Vender: ${item.brand} ${item.model}`;
        app.openModal('pos-price');
    },

    confirmAddToCart: (e) => {
        e.preventDefault();
        const serial = document.getElementById('pos-temp-serial').value;
        const price = parseFloat(document.getElementById('pos-temp-price').value);
        const item = DB.getInventory().find(i => i.serial === serial);
        if(app.cart.find(c => c.serial === serial)) { Utils.showToast('Ya está en el carrito', 'error'); return; }
        app.cart.push({ ...item, salePrice: price, cartId: Date.now() });
        app.renderCart();
        app.closeModal('pos-price');
        if(window.innerWidth <= 768) app.toggleCartMobile(true);
    },

    renderCart: () => {
        const list = document.getElementById('cart-list');
        const countBadge = document.getElementById('cart-count-badge');
        if(countBadge) countBadge.textContent = app.cart.length;
        
        if(app.cart.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: #94a3b8; margin-top: 50px;"><i class="fas fa-basket-shopping" style="font-size: 2rem;"></i><p>El carrito está vacío</p></div>`;
            const totalEl = document.getElementById('cart-total');
            if(totalEl) totalEl.textContent = '$0.00';
            return;
        }
        list.innerHTML = '';
        let total = 0;
        app.cart.forEach((c, idx) => {
            total += c.salePrice;
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-info">
                    <h4>${c.brand} ${c.model}</h4>
                    <p style="font-size:0.75rem; color:#666;">${c.serial} | ${c.warehouse}</p>
                </div>
                <div class="flex items-center" style="gap:10px;"><span style="font-weight:700;">${Utils.formatCurrency(c.salePrice)}</span><button class="btn-remove" onclick="app.removeFromCart(${idx})"><i class="fas fa-trash"></i></button></div>
            `;
            list.appendChild(div);
        });
        const totalEl = document.getElementById('cart-total');
        if(totalEl) totalEl.textContent = Utils.formatCurrency(total);
    },

    removeFromCart: (idx) => { app.cart.splice(idx, 1); app.renderCart(); },
    
    toggleCartMobile: (forceOpen = null) => {
        if(window.innerWidth <= 768) {
            const el = document.getElementById('pos-cart-panel');
            if(forceOpen === true) el.classList.add('open');
            else if(forceOpen === false) el.classList.remove('open');
            else el.classList.toggle('open');
        }
    },

    prepareCheckout: () => {
        if(app.cart.length === 0) { Utils.showToast('Carrito vacío', 'error'); return; }
        const total = app.cart.reduce((sum, i) => sum + i.salePrice, 0);
        document.getElementById('pos-checkout-total').textContent = Utils.formatCurrency(total);
        document.getElementById('form-pos-checkout').reset();
        document.getElementById('pos-payment-method').value = 'EFECTIVO';
        app.toggleInstallments();
        app.openModal('pos-checkout');
    },

    toggleInstallments: () => {
        const method = document.getElementById('pos-payment-method').value;
        const group = document.getElementById('pos-installments-group');
        if(method === 'TARJETA_CREDITO') group.classList.remove('hidden');
        else group.classList.add('hidden');
    },

    finalizePosSale: (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const buyerData = {
            name: formData.get('buyerName') || 'Cliente General',
            phone: formData.get('buyerPhone'),
            email: formData.get('buyerEmail'),
            invoice: formData.get('requestInvoice') === 'on'
        };

        const paymentMethod = formData.get('paymentMethod');
        const installments = formData.get('installments') || 1;

        const inv = DB.getInventory();
        const movements = DB.getMovements();
        let totalSale = 0, totalCost = 0;
        const mainMovementId = Date.now();
        const itemsSold = [];

        const isExternal = app.currentUser.role === 'VENDEDOR EXTERNO';

        app.cart.forEach(cItem => {
            const idx = inv.findIndex(i => i.serial === cItem.serial);
            if(idx !== -1) {
                const originalWarehouse = inv[idx].warehouse;
                
                // Si estaba en prestamo, resolverlo
                if(inv[idx].loanData && inv[idx].loanData.active) {
                    inv[idx].loanData.active = false;
                    inv[idx].loanData.returned = true;
                    inv[idx].loanData.isSold = true;
                    DB.clearNotificationsForSerial(inv[idx].serial);
                }

                if(inv[idx].request) delete inv[idx].request;

                inv[idx].soldBy = app.currentUser.user;

                totalSale += cItem.salePrice;
                totalCost += cItem.cost;
                itemsSold.push({ 
                    serial: cItem.serial, brand: cItem.brand, model: cItem.model, 
                    cost: cItem.cost, salePrice: cItem.salePrice,
                    originalWarehouse: originalWarehouse 
                });
            }
        });

        const transactionWarehouse = app.currentUser.warehouse === 'ALL' ? (itemsSold[0]?.originalWarehouse || 'ALVAGARA') : app.currentUser.warehouse;

        // MOVIMIENTO DE VENTA
        movements.push({
            id: mainMovementId,
            date: new Date().toISOString(),
            user: app.currentUser.user,
            userName: app.currentUser.name,
            warehouse: transactionWarehouse,
            items: itemsSold,
            oldStatus: 'EN_INVENTORY',
            newStatus: isExternal ? 'VENDIDO_PENDIENTE' : 'VENDIDO', // CLAVE: Externo inicia pendiente
            buyerName: buyerData.name,
            buyerPhone: buyerData.phone,
            buyerEmail: buyerData.email,
            cost: totalCost,
            salePrice: totalSale,
            profit: totalSale - totalCost,
            invoiceRequested: buyerData.invoice,
            paymentMethod: paymentMethod,
            installments: installments,
            isExternal: isExternal
        });

        DB.saveInventory(inv);
        DB.saveMovements(movements);

        if(isExternal) {
            // LÓGICA EXTERNA: GENERAR DEUDA. NO SUBE CAPITAL.
            itemsSold.forEach(i => {
                const idx = inv.findIndex(x => x.serial === i.serial);
                if(idx !== -1) {
                    inv[idx].status = 'VENDIDO_PENDIENTE'; // ESTADO CRUCIAL
                    inv[idx].saleDate = new Date().toISOString();
                    inv[idx].paymentStatus = {
                        total: i.salePrice,
                        paid: 0,
                        debt: i.salePrice,
                        originWarehouse: i.originalWarehouse
                    };
                }
            });
            DB.saveInventory(inv);
            Utils.showToast(`Venta registrada. Deuda generada: $${Utils.formatCurrency(totalSale)}. Pendientes pagos.`);
        } else {
            // COMPORTAMIENTO NORMAL: SUBE CAPITAL INMEDIATO
            const currentCapital = DB.getCapital();
            DB.updateCapital(currentCapital + totalSale);
            Utils.showToast(`Capital actualizado: +${Utils.formatCurrency(totalSale)}`);
        }

        if(buyerData.invoice) {
            app.generateInvoice(movements[movements.length-1]);
        }

        app.cart = [];
        app.renderPOS();
        app.renderCart();
        app.closeModal('pos-checkout');
        Utils.showToast('¡Venta exitosa!');
    },

    filterPos: (txt) => {
        const cards = document.querySelectorAll('.product-card');
        cards.forEach(c => c.style.display = c.innerText.toLowerCase().includes(txt.toLowerCase()) ? 'block' : 'none');
    },

    // --- LÓGICA DE PAGOS (CRÍTICA PARA CAPITAL) ---
    
    renderPayments: () => {
        const list = DB.getInventory();
        const container = document.getElementById('payments-debt-list');
        const select = document.getElementById('pay-select-invoice');
        const isExternal = app.currentUser.role === 'VENDEDOR EXTERNO';
        
        // CONFIGURACIÓN DE VISIBILIDAD
        const titleExt = document.getElementById('payments-title-text');
        const titleAdmin = document.getElementById('admin-payments-text');
        const verifyArea = document.getElementById('admin-verification-area');
        const debtCard = document.getElementById('debts-card');
        const formCard = document.getElementById('payment-form-card');

        if(isExternal) {
            // VISTA EXTERNO
            titleExt.classList.remove('hidden');
            titleAdmin.classList.add('hidden');
            verifyArea.classList.add('hidden');
            debtCard.classList.remove('hidden');
            formCard.classList.remove('hidden');
        } else {
            // VISTA ADMIN
            titleExt.classList.add('hidden');
            titleAdmin.classList.remove('hidden');
            verifyArea.classList.remove('hidden');
            debtCard.classList.add('hidden');
            formCard.classList.add('hidden');
            app.renderPendingVerifications();
            return; // El admin no ve sus propias deudas en esta vista, usa la tabla de abajo
        }
        
        // LÓGICA PARA EXTERNOS (VER DEUDAS)
        if(!container || !select) return;

        container.innerHTML = '';
        select.innerHTML = '<option value="">Seleccione factura...</option>';
        
        const debts = list.filter(i => (i.status === 'VENDIDO_PENDIENTE') && i.paymentStatus && i.paymentStatus.debt > 0 && i.soldBy === app.currentUser.user);
        
        if(debts.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#777;">No tienes deudas pendientes.</p>';
            return;
        }

        debts.forEach(item => {
            const p = item.paymentStatus;
            const progress = (p.paid / p.total) * 100;
            
            const div = document.createElement('div');
            div.className = 'payment-item';
            div.innerHTML = `
                <div class="flex justify-between">
                    <strong>${item.brand} ${item.model}</strong>
                    <span>${item.serial}</span>
                </div>
                <div style="font-size:0.9rem; margin-top:5px;">
                    Total: ${Utils.formatCurrency(p.total)} | Pagado: ${Utils.formatCurrency(p.paid)}
                </div>
                <div style="background:#ddd; height:10px; border-radius:5px; margin-top:5px; overflow:hidden;">
                    <div style="background:#2ecc71; height:100%; width:${progress}%"></div>
                </div>
            `;
            container.appendChild(div);

            const opt = document.createElement('option');
            opt.value = item.serial;
            opt.textContent = `${item.brand} ${item.model} - Debe: ${Utils.formatCurrency(p.debt)}`;
            select.appendChild(opt);
        });
    },

    renderPendingVerifications: () => {
        // VISTA ADMIN: VERIFICAR ABONOS
        const movements = DB.getMovements();
        const tbody = document.getElementById('pending-verification-body');
        tbody.innerHTML = '';

        const pending = movements.filter(m => m.type === 'PAYMENT_REQUEST' && m.status === 'PENDING_VERIFICATION');

        if(pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500">No hay pagos pendientes de verificar.</td></tr>';
            return;
        }

        pending.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(m.date).toLocaleDateString()}</td>
                <td>${m.userName || m.user}</td>
                <td>${m.itemSerial}</td>
                <td style="font-weight:bold; color:#27ae60;">+${Utils.formatCurrency(m.amount)}</td>
                <td>
                    <button class="action-btn success" onclick="app.verifyPayment(${m.id})"><i class="fas fa-check"></i> Verificar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    processPayment: () => {
        const serial = document.getElementById('pay-select-invoice').value;
        const amount = parseFloat(document.getElementById('pay-amount').value);
        const method = document.getElementById('pay-method').value;

        if(!serial || !amount || amount <= 0) { Utils.showToast('Datos inválidos', 'error'); return; }

        const inv = DB.getInventory();
        const idx = inv.findIndex(i => i.serial === serial);
        const item = inv[idx];

        // Registrar movimiento de pago pendiente
        const movements = DB.getMovements();
        movements.push({
            id: Date.now(),
            date: new Date().toISOString(),
            type: 'PAYMENT_REQUEST',
            user: app.currentUser.user,
            userName: app.currentUser.name,
            amount: amount,
            method: method,
            itemSerial: serial,
            warehouseOrigin: item.paymentStatus.originWarehouse,
            status: 'PENDING_VERIFICATION'
        });
        
        DB.saveMovements(movements);

        // Notificar al Admin
        DB.addNotification('ADMIN', `Pago recibido: ${Utils.formatCurrency(amount)} por ${item.brand} ${item.model}. Requiere verificación.`);
        
        Utils.showToast('Abono enviado. Esperando confirmación del almacén.');
        app.renderPayments();
        document.getElementById('pay-amount').value = '';
    },

    verifyPayment: (movementId) => {
        if(!confirm('¿Confirma que recibió este dinero?')) return;
        
        const movements = DB.getMovements();
        const movIdx = movements.findIndex(m => m.id === movementId);
        const movement = movements[movIdx];

        if(movement && movement.status === 'PENDING_VERIFICATION') {
            // 1. ACTUALIZAR CAPITAL (Dinero real entra a la empresa)
            const currentCapital = DB.getCapital();
            DB.updateCapital(currentCapital + movement.amount);

            // 2. ACTUALIZAR DEUDA DEL ITEM
            const inv = DB.getInventory();
            const itemIdx = inv.findIndex(i => i.serial === movement.itemSerial);
            const item = inv[itemIdx];
            
            item.paymentStatus.paid += movement.amount;
            item.paymentStatus.debt -= movement.amount;

            // 3. VERIFICAR SI YA PAGÓ TODO
            let fullyPaid = false;
            if(item.paymentStatus.debt <= 0) {
                fullyPaid = true;
                item.status = 'VENDIDO'; // CAMBIA A ESTADO FINAL
                Utils.showToast('¡Venta completada! El item ha sido pagado en su totalidad.');
            } else {
                Utils.showToast(`Pago verificado. Restan ${Utils.formatCurrency(item.paymentStatus.debt)}`);
            }

            // 4. ACTUALIZAR MOVIMIENTO
            movements[movIdx].status = 'VERIFIED';
            movements[movIdx].verifiedBy = app.currentUser.user;
            movements[movIdx].verifiedAt = new Date().toISOString();
            movements[movIdx].fullyPaid = fullyPaid; // Flag
            
            DB.saveMovements(movements);
            DB.saveInventory(inv);
            
            // Refrescar vista si estamos en payments
            app.renderPendingVerifications();
        }
    },

    // --- FIN LÓGICA DE PAGOS ---

    renderInventory: () => {
        const list = DB.getInventory();
        const tbody = document.getElementById('inventory-table-body');
        tbody.innerHTML = '';

        const search = document.getElementById('search-inventory').value.toLowerCase();
        const statusFilter = document.getElementById('filter-status').value;
        const userWh = app.currentUser.warehouse;
        const role = app.currentUser.role;

        const filtered = list.filter(item => {
            const matchSearch = item.serial.toLowerCase().includes(search) || item.brand.toLowerCase().includes(search) || item.model.toLowerCase().includes(search);
            const matchStatus = statusFilter ? item.status === statusFilter : true;
            
            if(role === 'ADMIN') return matchSearch && matchStatus;
            if(role === 'GERENTE') return matchSearch && matchStatus; 
            if(role === 'VENDEDOR') return matchSearch && matchStatus; 
            if(role === 'VENDEDOR EXTERNO') return matchSearch && matchStatus;

            return false;
        });

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            const isMyWarehouse = item.warehouse === userWh;
            
            let reqBadge = '';
            if(item.request?.status === 'REQUESTED') reqBadge = `<span class="badge REQUESTED">Solicitado por ${item.request.requesterName}</span>`;
            if(item.request?.status === 'APPROVED') reqBadge = `<span class="badge APPROVED">Aprobado para ${item.request.requesterName}</span>`;
            if(item.request?.status === 'REJECTED') reqBadge = `<span class="badge REJECTED">Rechazado</span>`;

            let actions = '';
            
            if (role === 'VENDEDOR' || role === 'VENDEDOR EXTERNO') {
                if(item.status === 'EN_INVENTORY') {
                    if(!item.request || item.request.status === 'REJECTED') {
                        actions += `<button class="action-btn" onclick="app.requestItem('${item.serial}')" title="Solicitar a otro almacén"><i class="fas fa-hand-holding"></i> Solicitar</button>`;
                    } else if (item.request?.status === 'REQUESTED') {
                        if(item.request.requesterUser === app.currentUser.user) {
                            actions += `<span style="font-size:0.8rem; color:#f39c12;">En espera</span>`;
                        }
                    } else if (item.request?.status === 'APPROVED') {
                        if(item.request.requesterUser === app.currentUser.user) {
                            actions += `<span style="font-size:0.8rem; color:green;">Disponible</span>`;
                        }
                    }
                }
            }

            if (role === 'ADMIN' || (role === 'GERENTE' && isMyWarehouse)) {
                actions += `<button class="action-btn secondary" onclick="app.openStatusModal('${item.serial}')"><i class="fas fa-exchange-alt"></i></button>`;
            }

            if(isMyWarehouse && item.request?.status === 'REQUESTED') {
                actions += ` <button class="action-btn success" onclick="app.resolveRequest('${item.serial}', true)" title="Aprobar"><i class="fas fa-check"></i></button>`;
                actions += ` <button class="action-btn danger" onclick="app.resolveRequest('${item.serial}', false)" title="Rechazar"><i class="fas fa-times"></i></button>`;
            }

            tr.innerHTML = `
                <td data-label="Serial"><strong>${item.serial}</strong></td>
                <td data-label="Marca/Modelo">${item.brand} ${item.model}</td>
                <td data-label="Almacén">${item.warehouse} ${!isMyWarehouse ? '<i class="fas fa-external-link-alt" style="font-size:0.8rem"></i>' : ''}</td>
                <td data-label="Costo">${Utils.formatCurrency(item.cost)}</td>
                <td data-label="Estado"><span class="badge ${item.status}">${item.status.replace('_', ' ')}</span></td>
                <td data-label="Solicitud">${reqBadge}</td>
                <td data-label="Acciones">${actions}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    filterInventory: () => app.renderInventory(),

    openModal: (id) => {
        const modal = document.getElementById(`modal-${id}`);
        if(modal) modal.classList.remove('hidden');
        
        if(id === 'add-item') {
            const whSelect = document.getElementById('add-warehouse-select');
            const lockMsg = document.getElementById('wh-locked-msg');
            
            whSelect.innerHTML = '';
            DB.getWarehouses().forEach(wh => {
                whSelect.innerHTML += `<option value="${wh}">${wh}</option>`;
            });

            if(app.currentUser.role !== 'ADMIN') {
                whSelect.value = app.currentUser.warehouse;
                whSelect.disabled = true;
                lockMsg.classList.remove('hidden');
            } else {
                whSelect.disabled = false;
                lockMsg.classList.add('hidden');
            }
        }
    },

    handleAddItem: (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        let targetWarehouse = formData.get('warehouse');
        if (app.currentUser.role !== 'ADMIN') targetWarehouse = app.currentUser.warehouse;
        if (!targetWarehouse) targetWarehouse = 'ALVAGARA';

        const newItemCost = parseFloat(formData.get('cost'));

        const currentCapital = DB.getCapital();
        if (currentCapital < newItemCost) {
            Utils.showToast(`Saldo Insuficiente. Capital: ${Utils.formatCurrency(currentCapital)}, Costo: ${Utils.formatCurrency(newItemCost)}`, 'error');
            return;
        }

        const newItem = {
            serial: formData.get('serial').toUpperCase(), 
            brand: formData.get('brand'), 
            model: formData.get('model'),
            type: formData.get('type'), 
            cost: newItemCost, 
            warehouse: targetWarehouse, 
            status: 'EN_INVENTORY', 
            date: new Date().toISOString()
        };
        const list = DB.getInventory();
        if (list.find(i => i.serial === newItem.serial)) { Utils.showToast('El serial ya existe', 'error'); return; }
        list.push(newItem);
        DB.saveInventory(list);

        DB.updateCapital(currentCapital - newItemCost);

        Utils.showToast(`Equipo registrado. Capital descontado: -${Utils.formatCurrency(newItemCost)}`);
        app.closeModal('add-item');
        e.target.reset();
        app.renderInventory();
    },

    openStatusModal: (serial) => {
        const list = DB.getInventory();
        const item = list.find(i => i.serial === serial);
        if (!item) return;

        const loanWhSelect = document.getElementById('loan-warehouse-select');
        loanWhSelect.innerHTML = '';
        DB.getWarehouses().forEach(wh => {
            if(wh !== item.warehouse) {
                loanWhSelect.innerHTML += `<option value="${wh}">${wh}</option>`;
            }
        });

        document.getElementById('status-serial').value = item.serial;
        document.getElementById('status-cost').value = item.cost;
        document.getElementById('new-cost-input').value = ''; 
        document.getElementById('modal-item-info').textContent = `Equipo: ${item.brand} ${item.model} (${item.serial}) - [${item.warehouse}]`;
        
        document.getElementById('status-select').value = item.status;
        app.toggleStatusFields();
        
        document.querySelectorAll('#form-update-status input[type="text"]').forEach(i => i.value = '');
        const chkInvoice = document.querySelector('#chk-invoice-inv');
        if(chkInvoice) chkInvoice.checked = false;

        app.openModal('update-status');
    },

    toggleStatusFields: () => {
        const status = document.getElementById('status-select').value;
        document.getElementById('fields-sale').classList.add('hidden');
        document.getElementById('fields-loan').classList.add('hidden');
        if (status === 'VENDIDO') document.getElementById('fields-sale').classList.remove('hidden');
        if (status === 'PRESTADO') document.getElementById('fields-loan').classList.remove('hidden');
    },

    toggleLoanDest: () => {
        const type = document.getElementById('loan-dest-type').value;
        if(type === 'PERSONA') {
            document.getElementById('field-loan-person').classList.remove('hidden');
            document.getElementById('field-loan-warehouse').classList.add('hidden');
        } else {
            document.getElementById('field-loan-person').classList.add('hidden');
            document.getElementById('field-loan-warehouse').classList.remove('hidden');
        }
    },

    handleUpdateStatus: (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const serial = formData.get('serial');
        const newStatus = formData.get('newStatus');
        const salePriceStr = formData.get('salePrice');
        const cost = parseFloat(formData.get('current-cost'));
        const newCostStr = formData.get('newCost');
        
        const list = DB.getInventory();
        const idx = list.findIndex(i => i.serial === serial);
        const oldStatus = list[idx].status;
        
        let finalCost = cost;
        if(newCostStr && parseFloat(newCostStr) > 0) {
            finalCost = parseFloat(newCostStr);
            const movements = DB.getMovements();
            movements.push({
                date: new Date().toISOString(), serial: serial, brand: list[idx].brand, model: list[idx].model,
                oldStatus: oldStatus, newStatus: 'COST_ADJUSTMENT', 
                user: app.currentUser.user, warehouse: list[idx].warehouse,
                cost: cost, salePrice: 0, profit: 0, notes: `Ajuste de costo: ${Utils.formatCurrency(cost)} -> ${Utils.formatCurrency(finalCost)}`
            });
            DB.saveMovements(movements);
            list[idx].cost = finalCost; 
        }

        let salePrice = 0;
        if (newStatus === 'VENDIDO') {
            if (!salePriceStr || parseFloat(salePriceStr) <= 0) { Utils.showToast('Precio de venta inválido', 'error'); return; }
            salePrice = parseFloat(salePriceStr);
        }

        list[idx].status = newStatus;
        DB.saveInventory(list);

        const movements = DB.getMovements();
        const movement = {
            date: new Date().toISOString(), 
            serial: serial, 
            brand: list[idx].brand, 
            model: list[idx].model,
            oldStatus: oldStatus, 
            newStatus: newStatus, 
            user: app.currentUser.user,
            userName: app.currentUser.name,
            warehouse: list[idx].warehouse,
            cost: finalCost, 
            salePrice: salePrice, 
            profit: salePrice - finalCost,
            remissionId: null
        };

        if(newStatus === 'VENDIDO') {
            movement.buyerName = formData.get('buyerName') || 'Cliente General';
            movement.buyerPhone = formData.get('buyerPhone');
            movement.buyerEmail = formData.get('buyerEmail');
            movement.invoiceRequested = formData.get('requestInvoice') === 'on';
        }
        if(newStatus === 'PRESTADO') { 
            const destType = formData.get('loanDestinationType');
            if(destType === 'ALMACEN') {
                const targetWh = formData.get('loanWarehouse');
                movement.loanTo = targetWh; 
                movement.type = 'REMISION';
                movement.remissionId = Utils.generateRemissionId();
                Utils.showToast(`Remisión ${movement.remissionId} generada para ${targetWh}`);
            } else {
                movement.loanTo = formData.get('loanTo'); 
            }
        }

        if(newStatus !== 'COST_ADJUSTMENT') {
            movements.push(movement);
            DB.saveMovements(movements);
        }

        if(newStatus === 'VENDIDO' && movement.invoiceRequested) { app.generateInvoice(movement); }

        Utils.showToast('Estado actualizado');
        app.closeModal('update-status');
        app.renderInventory();
    },

    renderSales: () => {
        const movements = DB.getMovements();
        let totalRevenue = 0, totalProfit = 0, profitToday = 0;
        const today = new Date().toISOString().split('T')[0];
        const userWh = app.currentUser.warehouse;
        const role = app.currentUser.role;

        const tbody = document.getElementById('sales-table-body');
        tbody.innerHTML = '';

        const sortedMovements = [...movements].sort((a,b) => new Date(b.date) - new Date(a.date));

        sortedMovements.forEach(m => {
            if(userWh !== 'ALL' && m.warehouse !== userWh) return;

            let isSale = false;
            let revenue = 0;
            let profit = 0;

            // Mostramos VENDIDO (Pagado total) y VENDIDO_PENDIENTE
            if (m.newStatus === 'VENDIDO' || m.newStatus === 'VENDIDO_PENDIENTE') {
                isSale = true;
                revenue = m.salePrice;
                profit = m.profit;

                // Para calculos de totales dashboard, solo sumamos lo definitivamente pagado (VENDIDO) o si es Admin ve todo
                if(m.newStatus === 'VENDIDO') {
                    totalRevenue += revenue;
                    totalProfit += profit;
                    if (m.date.startsWith(today)) profitToday += profit;
                }
            }

            if (isSale) {
                const tr = document.createElement('tr');
                const clientName = m.buyerName || 'Cliente General';
                const pmLabel = m.paymentMethod ? m.paymentMethod.replace('_', ' ') : '-';
                
                // Badge diferenciador
                const statusBadge = m.newStatus === 'VENDIDO_PENDIENTE' 
                    ? `<span class="badge" style="background:#ffe0b2; color:#e65100;">PENDIENTE</span>` 
                    : `<span class="badge" style="background:#d4edda; color:#155724;">PAGADO</span>`;

                tr.innerHTML = `
                    <td>${new Date(m.date).toLocaleString()}</td>
                    <td>${m.userName || m.user}</td>
                    <td>${m.warehouse}</td>
                    <td>${clientName} ${m.isExternal ? '<span class="badge" style="background:#f39c12; color:white;">EXT</span>' : ''}</td>
                    <td><span class="badge" style="background:#eee; color:#333;">${pmLabel}</span> ${statusBadge}</td>
                    <td style="color: green; font-weight: bold;">${Utils.formatCurrency(revenue)}</td>
                    <td>
                        <div class="flex" style="gap:5px;">
                            ${m.invoiceRequested ? `<button class="action-btn" style="background:#3498db" onclick="app.generateInvoice(app.findMovement(${m.id}))"><i class="fas fa-envelope"></i></button>` : ''}
                            <button class="action-btn secondary" onclick="app.openSaleDetails(${m.id})"><i class="fas fa-eye"></i></button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });

        const kpiTotalRev = document.getElementById('kpi-total-revenue');
        if(kpiTotalRev) kpiTotalRev.textContent = Utils.formatCurrency(totalRevenue);

        const kpiProfitRep = document.getElementById('kpi-profit-report');
        if(kpiProfitRep) kpiProfitRep.textContent = Utils.formatCurrency(totalProfit);

        const kpiProfitToday = document.getElementById('kpi-profit-today');
        if(kpiProfitToday) kpiProfitToday.textContent = Utils.formatCurrency(profitToday);
    },

    findMovement: (id) => DB.getMovements().find(m => m.id === id),

    openSaleDetails: (id) => {
        const movement = DB.getMovements().find(m => m.id === id);
        if (!movement) return;
        app.currentMovementForDetails = movement;

        const isPos = movement.items && movement.items.length > 0;
        const items = isPos ? movement.items : [movement];
        const clientName = movement.buyerName || 'Cliente de mostrador';
        const itemsCount = items.length > 1 ? `(${items.length} Artículos)` : '';
        
        let title = 'Detalle de Venta';
        if(movement.remissionId) title = `Remisión: ${movement.remissionId}`;
        
        const titleEl = document.getElementById('detail-modal-title');
        if(titleEl) titleEl.textContent = title;

        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.brand} ${item.model}</td>
                    <td>${item.serial}</td>
                    <td style="color:#777;">${Utils.formatCurrency(item.cost)}</td>
                    <td style="font-weight:bold;">${Utils.formatCurrency(item.salePrice || 0)}</td>
                </tr>
            `;
        });
        
        let extraInfo = '';
        if(movement.newStatus === 'PRESTADO') {
            extraInfo = `<div style="margin-bottom:10px; padding:10px; background:#fff3e0; border-radius:8px; color:#e67e22;">
                            <strong><i class="fas fa-exchange-alt"></i> Préstamo/Traslado</strong><br>
                            Destino: ${movement.loanTo}
                            ${movement.remissionId ? `<br>Remisión ID: <strong>${movement.remissionId}</strong>` : ''}
                          </div>`;
        }
        
        let paymentInfo = '';
        if(movement.newStatus === 'VENDIDO_PENDIENTE') {
            paymentInfo = `<div style="margin-bottom:10px; padding:10px; background:#ffe0b2; border-radius:8px; color:#e65100;">
                            <strong><i class="fas fa-clock"></i> Venta Pendiente de Pago</strong><br>
                            Deuda Actual: <strong>${Utils.formatCurrency(movement.salePrice)}</strong>
                          </div>`;
        }

        const content = document.getElementById('sale-details-content');
        content.innerHTML = `
            <div class="detail-grid">
                <div class="detail-card">
                    <div class="detail-label">ID Transacción</div>
                    <div class="detail-value">${movement.id}</div>
                    <div class="detail-label">Fecha</div>
                    <div class="detail-value">${new Date(movement.date).toLocaleString()}</div>
                </div>
                <div class="detail-card">
                    <div class="detail-label">Ejecutado por</div>
                    <div class="detail-value">${movement.userName || movement.user}</div>
                    <div class="detail-label">Almacén</div>
                    <div class="detail-value">${movement.warehouse}</div>
                </div>
            </div>

            ${extraInfo}
            ${paymentInfo}

            ${movement.newStatus === 'VENDIDO' || movement.newStatus === 'VENDIDO_PENDIENTE' ? `
            <h4 style="margin: 15px 0 10px 0; color: #555;">Artículos Vendidos ${itemsCount}</h4>
            <table class="sale-items-table">
                <thead>
                    <tr>
                        <th>Artículo</th>
                        <th>Serial</th>
                        <th>Costo</th>
                        <th>Precio Venta</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <div class="total-row">
                <div>
                    <div class="detail-label">Ganancia Neta</div>
                    <div class="detail-value" style="color: #2ecc71;">${Utils.formatCurrency(movement.profit)}</div>
                </div>
                <div style="text-align: right;">
                    <div class="detail-label">Método Pago</div>
                    <div style="font-weight:bold; margin-bottom:5px;">${movement.paymentMethod ? movement.paymentMethod.replace('_', ' ') : '-'}</div>
                    <div class="detail-label">Total Venta</div>
                    <div class="total-big">${Utils.formatCurrency(movement.salePrice)}</div>
                </div>
            </div>
            ` : `
            <div style="text-align:center; padding:20px; color:#777;">
                Movimiento interno de inventario (No afecta caja directamente).
            </div>
            `}
        `;

        const invoiceBtn = document.getElementById('btn-invoice-from-details');
        if(movement.invoiceRequested && (movement.newStatus === 'VENDIDO' || movement.newStatus === 'VENDIDO_PENDIENTE')) {
            invoiceBtn.classList.remove('hidden');
            invoiceBtn.innerHTML = `<i class="fas fa-print"></i> Factura`;
        } else {
            invoiceBtn.classList.add('hidden');
        }

        app.openModal('sale-details');
    },

    generateInvoiceFromDetails: () => {
        if(app.currentMovementForDetails) {
            app.generateInvoice(app.currentMovementForDetails);
        }
    },

    generateInvoice: (movement) => {
        if(!movement) return;

        document.getElementById('inv-date').textContent = new Date(movement.date).toLocaleString();
        document.getElementById('inv-id').textContent = `FACT-${movement.id}`;
        
        const invClientName = document.getElementById('inv-client-name');
        if(invClientName) invClientName.textContent = movement.buyerName;
        
        const invClientEmail = document.getElementById('inv-client-email');
        if(invClientEmail) invClientEmail.textContent = movement.buyerEmail;
        
        const invClientPhone = document.getElementById('inv-client-phone');
        if(invClientPhone) invClientPhone.textContent = movement.buyerPhone;
        
        const invWh = document.getElementById('inv-wh');
        if(invWh) invWh.textContent = `Almacén: ${movement.warehouse}`;

        const tbody = document.getElementById('inv-items');
        tbody.innerHTML = '';
        let total = 0;
        const itemsToRender = movement.items || [movement];

        itemsToRender.forEach(item => {
            const price = item.salePrice;
            total += price;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.brand} ${item.model}</td>
                <td>${item.serial}</td>
                <td>${Utils.formatCurrency(price)}</td>
                <td>${Utils.formatCurrency(price)}</td>
            `;
            tbody.appendChild(tr);
        });

        const invTotal = document.getElementById('inv-total');
        if(invTotal) invTotal.textContent = Utils.formatCurrency(total);
        
        window.print();

        if(movement.buyerEmail) {
            const subject = encodeURIComponent(`Factura Electrónica ALVAGARA - #${movement.id}`);
            const body = encodeURIComponent(`Estimado/a ${movement.buyerName},\n\nGracias por su compra en ALVAGARA.\n\nValor Total: ${Utils.formatCurrency(total)}\nMétodo de Pago: ${movement.paymentMethod}\nSe adjunta factura en formato PDF.\n\nSaludos cordiales.`);
            window.location.href = `mailto:${movement.buyerEmail}?subject=${subject}&body=${body}`;
        }
    },

    startAutoBackup: async () => {
        try {
            app.fileHandle = await window.showSaveFilePicker({
                suggestedName: `ALVAGARA_Backup_${new Date().toISOString().split('T')[0]}.xlsx`,
                types: [{ description: 'Excel File', accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']} }],
            });
        } catch (err) { }
        if (app.autoBackupInterval) clearInterval(app.autoBackupInterval);
        if(app.autoBackupEnabled) {
            app.autoBackupInterval = setInterval(() => { if(app.autoBackupEnabled) app.exportToExcel(true); }, 300000);
        }
    },

    exportToExcel: async (isAuto = false) => {
        const inventory = DB.getInventory();
        const movements = DB.getMovements();
        const ws1 = XLSX.utils.json_to_sheet(inventory);
        const ws2 = XLSX.utils.json_to_sheet(movements);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, "Inventario");
        XLSX.utils.book_append_sheet(wb, ws2, "Movimientos");
        const filename = `ALVAGARA_Backup_${new Date().toISOString().split('T')[0]}.xlsx`;
        if (isAuto && app.fileHandle) {
            try { const writable = await app.fileHandle.createWritable(); await writable.write(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })); await writable.close(); }
            catch (err) { XLSX.writeFile(wb, filename); }
        } else { XLSX.writeFile(wb, filename); }
    },

    importExcel: (input) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            let count = 0, updated = 0;
            const currentInventory = DB.getInventory();
            jsonData.forEach(row => {
                if (!row.serial) return;
                const newItem = { 
                    serial: row.serial ? row.serial.toString().toUpperCase() : '', 
                    brand: row.brand || 'Desconocido', 
                    model: row.model || '', 
                    type: row.type || 'CELULAR', 
                    cost: parseFloat(row.cost) || 0, 
                    warehouse: row.warehouse || 'ALVAGARA', 
                    status: row.status || 'EN_INVENTORY', 
                    date: row.date || new Date().toISOString() 
                };
                const existingIdx = currentInventory.findIndex(i => i.serial === newItem.serial);
                if (existingIdx >= 0) { currentInventory[existingIdx] = newItem; updated++; }
                else { currentInventory.push(newItem); count++; }
            });
            DB.saveInventory(currentInventory);
            Utils.showToast(`Importación finalizada. ${count} nuevos, ${updated} actualizados.`);
            input.value = '';
        };
        reader.readAsArrayBuffer(file);
    },

    closeModal: (id) => {
        const modal = document.getElementById(`modal-${id}`);
        if(modal) modal.classList.add('hidden');
    }
};

window.onload = app.init;