
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
    token: localStorage.getItem('spp_token'),
    user: JSON.parse(localStorage.getItem('spp_user') || 'null'),
    requests: [],
    balance: null,
    students: []
};

const roleNames = {
    student: 'Student',
    dsa: 'Dean of Student Affairs',
    sso: 'Student Service Officer'
};

const courses = [
    'BA Political Science and Sociology',
    'BSc Chemistry',
    'BSc Data Science',
    'BSc Life Sciences',
    'BSc Mathematics',
    'BSc Physics',
    'BSc Statistics',
    'DCPM',
    'DSDA',
    'EPS'
];

const studyYears = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];

const hostels = [
    'Dekiling',
    'Pemaling',
    'Gakiling',
    'Tshogyaling',
    'Yeatsholing',
    'Gatsheling',
    'DH I',
    'DH II',
    'DH VI',
    'DH VII',
    'DH VIII',
    'Minjurling',
    'Thubtenling',
    'Rabtenling',
    'Yontenling',
    'Norbuling',
    'DH III',
    'DH IV',
    'DH V',
    'MPH'
];

const sectionedYears = {
    'BSc Life Sciences': ['Year 1', 'Year 2', 'Year 3'],
    DSDA: ['Year 1', 'Year 2', 'Year 3', 'Year 4']
};

const statusNames = {
    pending_dsa: 'Pending DSA',
    pending_sso: 'Pending SSO',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled'
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

function selectOptions(values, selected = '', placeholder = 'Select an option') {
    return `<option value="">${placeholder}</option>${values.map(value =>
        `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`
    ).join('')}`;
}

function normalizeCourse(course) {
    if (courses.includes(course)) return course;
    if (/data science and data analytics/i.test(course || '')) return 'DSDA';
    return '';
}

function normalizeYear(year) {
    return studyYears.includes(year) ? year : String(year || '').match(/^Year ([1-4])(?: [AB])?$/)?.[0].slice(0, 6) || '';
}

function syncSectionSelect(courseSelect, yearSelect, sectionSelect, selected = '') {
    const hasSections = (sectionedYears[courseSelect.value] || []).includes(yearSelect.value);
    sectionSelect.innerHTML = hasSections
        ? selectOptions(['A', 'B'], selected, 'Select section')
        : '<option value="">Not applicable</option>';
    sectionSelect.disabled = !hasSections;
    sectionSelect.required = hasSections;
}

function studentProfileComplete(user) {
    if (!user?.course || !user.study_year || !user.hostel_name) return false;
    const course = normalizeCourse(user.course);
    const year = normalizeYear(user.study_year);
    return !(sectionedYears[course] || []).includes(year) || Boolean(user.section);
}

function toast(message, error = false) {
    const el = $('#toast');

    el.textContent = message;
    el.classList.remove('hidden', 'error');

    if (error) el.classList.add('error');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(() => el.classList.add('hidden'), 6500);
}

function isEmergency(request) {
    return String(request.leave_type || '').toLowerCase() === 'emergency';
}

// Get today's date in Bhutan time.
function todayBhutan() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Thimphu',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== 'literal') {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day}`;
}

async function api(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const res = await fetch(`/api${path}`, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await res.json();
    } catch {}

    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
    }

    return data;
}

function setLoggedIn(user, token) {
    state.user = user;
    state.token = token;

    localStorage.setItem('spp_user', JSON.stringify(user));
    localStorage.setItem('spp_token', token);

    showDashboard();
}

function logout() {
    state.user = null;
    state.token = null;
    state.balance = null;
    state.requests = [];
    state.students = [];

    localStorage.removeItem('spp_user');
    localStorage.removeItem('spp_token');

    $('#dashboard-view').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
    $('#logout-btn').classList.add('hidden');

    $('#page-heading').textContent = 'Welcome to your pass portal';

    $('#login-form').reset();
}

function showAuthTab(tab) {
    $$('[data-auth-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.authTab === tab);
    });

    $('#login-form').classList.toggle('hidden', tab !== 'login');
    $('#register-form').classList.toggle('hidden', tab !== 'register');
}

function badge(status) {
    return `<span class="status status-${esc(status)}">${esc(statusNames[status] || status)}</span>`;
}

// Use the working-day count calculated and stored by the backend.
function days(r) {
    return Number(r.leave_days || 0);
}

function date(v) {
    if (!v) return '—';

    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);

    return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function stat(label, value, note) {
    return `<div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-note">${note}</div>
    </div>`;
}

function empty(title, desc) {
    return `<div class="empty-state">
        <div class="empty-icon">⌁</div>
        <b>${title}</b>
        <p>${desc}</p>
    </div>`;
}

function requestTable(items, staff = false) {
    if (!items.length) {
        return empty(
            'Nothing here yet',
            staff
                ? 'Requests will appear here when students submit them.'
                : 'Your leave requests will appear here after you submit an application.'
        );
    }

    return `<div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Request</th>
                    ${staff ? '<th>Student</th>' : ''}
                    <th>Leave dates</th>
                    <th>Status</th>
                    <th>Action</th>
                </tr>
            </thead>

            <tbody>
                ${items.map(r => `<tr>
                    <td class="student-cell">
                        <b>#${r.id} · ${esc(r.leave_type)}</b>
                        <small>Submitted ${date(r.created_at)}</small>
                        ${isEmergency(r)
                            ? `<span class="urgent-badge">URGENT · EMERGENCY</span>
                                ${r.quota_exceeded
                                    ? '<small class="attendance-low">DSA quota override required</small>'
                                    : ''}`
                            : ''}
                    </td>

                    ${staff ? `<td class="student-cell">
                        <b>${esc(r.student_name)}</b>
                        <small>${esc(r.student_number || r.student_email || '')}</small>
                        <small>${esc(r.course || 'Course not provided')} · ${esc(r.study_year || 'Year not provided')}${r.section ? ` · Section ${esc(r.section)}` : ''}</small>
                        <small>${esc(r.hostel_name || 'Hostel not provided')}</small>
                    </td>` : ''}

                    <td>
                        ${date(r.start_date)} – ${date(r.end_date)}
                        <small class="muted">${days(r)} working day(s)</small>
                    </td>

                    <td>${badge(r.status)}</td>

                    <td>
                        <div class="inline-form">
                            <button class="btn btn-soft btn-small" data-view="${r.id}">
                                View
                            </button>

                            ${!staff && r.status === 'pending_sso'
                                ? `<button class="btn btn-ghost btn-small" data-edit-request="${r.id}">Edit</button>`
                                : ''}
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

function requestForm() {
    const remaining = Math.max(
        Number(state.balance?.total_days || 0) -
        Number(state.balance?.used_days || 0) -
        Number(state.balance?.pending_days || 0),
        0
    );

    return `<section class="panel" id="apply-panel">
        <div class="panel-head">
            <div>
                <h3>New leave application</h3>
                <p>Complete the details below to send your request to the SSO.</p>
            </div>
        </div>

        <div class="notice">
            Leave approval is based on your remaining leave quota; recorded attendance is informational only.
            Emergency requests that exceed quota require a documented DSA override.
            Requests are reviewed by the SSO first and forwarded to the DSA.
        </div>

        <div id="emergency-quota-warning" class="notice notice-urgent hidden" role="status">
            ${remaining === 0
                ? '<b>Your regular leave quota is exhausted.</b> You may still submit an Emergency request. It will be prioritized for staff review, but final approval requires a DSA override and written justification.'
                : `<b>Emergency requests are prioritized for staff review.</b> If your request exceeds your remaining quota of ${remaining} day(s), final approval requires a DSA override and written justification.`}
        </div>

        <form id="leave-form">
            <div class="form-grid">

                <label class="field">
                    Leave type
                    <select name="leaveType" required>
                        <option value="">Select type</option>
                        <option>Personal</option>
                        <option>Medical</option>
                        <option>Family</option>
                        <option>Official</option>
                        <option>Emergency</option>
                        <option>Other</option>
                    </select>
                </label>

                <label class="field">
                    Reason
                    <textarea name="reason" required maxlength="1500"
                        placeholder="Explain why you need leave"></textarea>
                </label>

                <label class="field">
                    Start date
                    <input name="startDate" type="date" required
                        min="${todayBhutan()}">
                </label>

                <label class="field">
                    End date
                    <input name="endDate" type="date" required
                        min="${todayBhutan()}">
                </label>

            </div>

            <div class="form-actions">
                <button class="btn btn-primary" type="submit">
                    Submit application →
                </button>
            </div>
        </form>
    </section>`;
}

async function loadDashboardData() {
    const r = await api('/leave-requests');

    state.requests = r.requests || [];

    if (state.user.role === 'student') {
        const b = await api('/leave-balance');

        state.balance = b.balance;

        state.user.attendance_percent =
            Number(state.user.attendance_percent);

        localStorage.setItem('spp_user', JSON.stringify(state.user));

    } else {
        const s = await api('/students');

        state.students = s.students || [];
    }
}

function studentDashboard() {
    const req = state.requests;

    const active = req.filter(r =>
        ['pending_dsa', 'pending_sso'].includes(r.status)
    );

    const approved = req.filter(r => r.status === 'approved');

    const bal = state.balance;
    const profileComplete = studentProfileComplete(state.user);

    if (!bal) {
        return `<section class="panel">
            ${empty(
                'Leave balance unavailable',
                'Please contact Student Services to configure your leave balance.'
            )}
        </section>`;
    }

    const total = Number(bal.total_days || 0);
    const used = Number(bal.used_days || 0);
    const pending = Number(bal.pending_days || 0);

    const remaining = Number(
        bal.remaining_days ?? (total - used - pending)
    );

    return `<div class="dashboard-intro">
        <div>
            <h2>Hello, ${esc(state.user.full_name.split(' ')[0])} 👋</h2>
            <p>Manage your leave applications and follow each decision here.</p>
        </div>

        ${profileComplete
            ? `<button class="btn btn-primary"
                onclick="document.querySelector('#apply-panel').scrollIntoView({behavior:'smooth'})">
                ＋ Apply for leave
            </button>`
            : '<span class="pill">Complete your profile to apply</span>'}
    </div>

    <div class="stats-grid">
        ${stat('TOTAL LEAVE DAYS', total, 'Your allocated quota')}

        ${stat('USED LEAVE DAYS', used, 'Finally approved by DSA')}

        ${stat('RESERVED DAYS', pending, 'Awaiting final decision')}

        ${stat('DAYS REMAINING', remaining, 'Available leave quota')}

        ${Number(bal.over_quota_days || 0) > 0
            ? stat('QUOTA OVERAGE', bal.over_quota_days,
                'Emergency request awaiting or using DSA override')
            : ''}

        ${stat('PENDING REQUESTS', active.length, 'Awaiting review')}

        ${stat('APPROVED REQUESTS', approved.length,
            'Approved by DSA and SSO')}
    </div>

    <section class="panel">
        <div class="panel-head">
            <div>
                <h3>My student profile</h3>
                <p>Keep your course, year, section, and hostel details up to date for student services.</p>
            </div>
        </div>

        ${!profileComplete
            ? `<div class="notice">
                Complete and save your course, year, section when listed, and hostel before applying for leave.
            </div>`
            : ''}

        <form id="student-profile-form">
            <div class="form-grid">
                <label class="field">
                    Student number
                    <input value="${esc(state.user.student_number || '')}" disabled>
                </label>

                <label class="field">
                    Course / programme
                    <select name="course" required>
                        ${selectOptions(courses, normalizeCourse(state.user.course), 'Select course / programme')}
                    </select>
                </label>

                <label class="field">
                    Year of study
                    <select name="year" required>
                        ${selectOptions(studyYears, normalizeYear(state.user.study_year), 'Select year')}
                    </select>
                </label>

                <label class="field">
                    Section
                    <select name="section" ${sectionedYears[normalizeCourse(state.user.course)]?.includes(normalizeYear(state.user.study_year)) ? 'required' : 'disabled'}>
                    </select>
                </label>

                <label class="field">
                    Hostel name
                    <select name="hostel" required>
                        ${selectOptions(hostels, state.user.hostel_name, 'Select hostel')}
                    </select>
                </label>
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" type="submit">Save profile</button>
            </div>
        </form>
    </section>

    <div class="content-grid">
        <div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <h3>My leave history</h3>
                        <p>Track your submitted requests.</p>
                    </div>
                </div>

                ${requestTable(req)}
            </section>
        </div>

        <div>
            ${profileComplete
                ? requestForm()
                : `<section class="panel" id="apply-panel">
                    <h3>Leave applications locked</h3>
                    <p>Complete and save your student profile above to apply for leave.</p>
                </section>`}

            <section class="panel">
                <div class="panel-head">
                    <div>
                        <h3>Approval process</h3>
                        <p>Every request follows these stages.</p>
                    </div>
                </div>

                <div class="steps process-steps">
                    <div>
                        <span>01</span>
                        <p>
                            <b>SSO review</b>
                            <small>First-stage review and eligibility check.</small>
                        </p>
                    </div>

                    <div>
                        <span>02</span>
                        <p>
                            <b>DSA review</b>
                            <small>Final decision after SSO approval.</small>
                        </p>
                    </div>

                    <div>
                        <span>03</span>
                        <p>
                            <b>Decision recorded</b>
                            <small>Comments and timestamps are saved.</small>
                        </p>
                    </div>
                </div>
            </section>
        </div>
    </div>`;
}

function staffDashboard() {
    const isSso = state.user.role === 'sso';

    const pending = state.requests.filter(r =>
        r.status === (isSso ? 'pending_sso' : 'pending_dsa')
    );
    const urgent = pending.filter(isEmergency);

    const low = state.students.filter(s =>
        Number(s.attendance_percent) <= 90
    );

    return `<div class="dashboard-intro">
        <div>
            <h2>${isSso ? 'SSO review desk' : 'DSA review desk'}</h2>
            <p>
                ${isSso
                    ? 'Review incoming requests as the first stage and forward eligible applications to the DSA.'
                    : 'Review requests forwarded by the SSO and record the final decision.'}
            </p>
        </div>

        <span class="pill" style="background:#e5f1e8;color:#24583d">
            ${roleNames[state.user.role]}
        </span>
    </div>

    <div class="stats-grid">
        ${stat('AWAITING YOUR REVIEW', pending.length, 'Needs action')}

        ${stat('URGENT EMERGENCIES', urgent.length, 'Prioritized in your review queue')}

        ${stat('TOTAL REQUESTS', state.requests.length, 'Visible requests')}

        ${stat('ATTENDANCE VALUES BELOW 90%', low.length, 'Informational only')}

        ${stat(
            'APPROVED',
            state.requests.filter(r => r.status === 'approved').length,
            'Final approval completed'
        )}
    </div>

    ${urgent.length
        ? `<section class="notice notice-urgent">
            <div>
                <b>Urgent access: ${urgent.length} emergency ${urgent.length === 1
                    ? 'request needs'
                    : 'requests need'} review</b>
                <span>Emergency requests are placed at the top of your queue.</span>
            </div>
            <button class="btn btn-urgent btn-small" data-view="${urgent[0].id}">
                Open urgent request #${urgent[0].id}
            </button>
        </section>`
        : ''}

    <section class="panel">
        <div class="panel-head">
            <div>
                <h3>${isSso ? 'Requests awaiting SSO' : 'Requests awaiting DSA'}</h3>
                <p>${isSso ? 'First-stage review' : 'Final-stage review'}</p>
            </div>
        </div>

        ${requestTable(pending, true)}
    </section>

    <section class="panel">
        <div class="panel-head">
            <div>
                <h3>Attendance values on file</h3>
                <p>
                    DSA can update attendance values and leave quotas.
                    Attendance is informational only and does not affect leave eligibility.
                </p>
            </div>
        </div>

        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Value on file</th>
                        <th>Leave balance</th>
                        <th>Record</th>
                    </tr>
                </thead>

                <tbody>
                    ${state.students.map(s => `<tr>
                        <td class="student-cell">
                            <b>${esc(s.full_name)}</b>
                            <small>${esc(s.student_number || s.email)}</small>
                            <small>${esc(s.course || 'Course not provided')} · ${esc(s.study_year || 'Year not provided')}${s.section ? ` · Section ${esc(s.section)}` : ''}</small>
                            <small>${esc(s.hostel_name || 'Hostel not provided')}</small>
                        </td>

                        <td class="${Number(s.attendance_percent) <= 90
                            ? 'attendance-low' : ''}">
                            ${Number(s.attendance_percent).toFixed(1)}%
                            ${Number(s.attendance_percent) <= 90 ? '⚠' : ''}
                        </td>

                        <td>
                            <b>${Number(s.remaining_days ?? 0)} days remaining</b>
                            <small class="muted">
                                ${Number(s.used_days ?? 0)} used ·
                                ${Number(s.pending_days ?? 0)} reserved ·
                                ${Number(s.total_days ?? 0)} total
                            </small>
                        </td>

                        <td>
                            ${!isSso
                                ? `<button class="btn btn-soft btn-small"
                                    data-edit-student="${s.id}"
                                    data-attendance="${s.attendance_percent}"
                                    data-total="${s.total_days ?? 10}">
                                    Edit
                                </button>`
                                : '<span class="muted">View only</span>'}
                        </td>
                    </tr>`).join('') ||
                    `<tr><td colspan="4">
                        ${empty('No students registered',
                            'Student accounts will appear here.')}
                    </td></tr>`}
                </tbody>
            </table>
        </div>
    </section>

    <section class="panel">
        <div class="panel-head">
            <div>
                <h3>All visible requests</h3>
                <p>Review the complete request history available to your role.</p>
            </div>
        </div>

        ${requestTable(
            state.requests.filter(r => !pending.some(p => p.id === r.id)),
            true
        )}
    </section>`;
}

async function showDashboard() {
    if (!state.user || !state.token) {
        logout();
        return;
    }

    try {
        const me = await api('/auth/me');

        state.user = { ...state.user, ...me.user };

        localStorage.setItem('spp_user', JSON.stringify(state.user));

    } catch (e) {
        if (/token|auth/i.test(e.message)) {
            logout();
            return;
        }
    }

    $('#auth-view').classList.add('hidden');
    $('#dashboard-view').classList.remove('hidden');
    $('#logout-btn').classList.remove('hidden');

    $('#page-heading').textContent =
        `${roleNames[state.user.role]} dashboard`;

    $('#dashboard-content').innerHTML =
        '<section class="panel">Loading your secure dashboard…</section>';

    try {
        await loadDashboardData();

        $('#dashboard-content').innerHTML =
            state.user.role === 'student'
                ? studentDashboard()
                : staffDashboard();

        bindDashboard();

    } catch (e) {
        $('#dashboard-content').innerHTML = `
            <section class="panel">
                <div class="notice danger">
                    ${esc(e.message)}
                    <button class="btn btn-soft btn-small" id="retry-btn">
                        Retry
                    </button>
                </div>
            </section>`;

        $('#retry-btn')?.addEventListener('click', showDashboard);
    }
}

function bindDashboard() {
    const profileForm = $('#student-profile-form');
    if (profileForm) {
        const course = profileForm.elements.course;
        const year = profileForm.elements.year;
        const section = profileForm.elements.section;
        const oldYearSection = String(state.user.study_year || '').match(/^Year [1-4] ([AB])$/)?.[1];
        syncSectionSelect(course, year, section, state.user.section || oldYearSection || '');
        course.addEventListener('change', () => syncSectionSelect(course, year, section));
        year.addEventListener('change', () => syncSectionSelect(course, year, section));
    }

    profileForm?.addEventListener('submit', async e => {
        e.preventDefault();

        const profile = Object.fromEntries(new FormData(e.currentTarget).entries());

        try {
            const out = await api('/auth/profile', {
                method: 'PATCH',
                body: JSON.stringify(profile)
            });

            state.user = { ...state.user, ...out.user };
            localStorage.setItem('spp_user', JSON.stringify(state.user));
            toast(out.message);
            await showDashboard();
        } catch (error) {
            toast(error.message, true);
        }
    });

    $('#leave-form')?.addEventListener('submit', async e => {
        e.preventDefault();

        const f = new FormData(e.currentTarget);
        const data = Object.fromEntries(f.entries());

        try {
            const out = await api('/leave-requests', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            toast(
                out.request?.quota_exceeded
                    ? 'Emergency request submitted urgently. It exceeds your quota and needs a DSA override for final approval.'
                    : out.request && isEmergency(out.request)
                        ? 'Emergency request submitted and prioritized for staff review.'
                        : out.message
            );

            await showDashboard();

        } catch (err) {
            toast(err.message, true);
        }
    });

    $('#leave-form [name="leaveType"]')?.addEventListener('change', e => {
        const warning = $('#emergency-quota-warning');
        const isUrgent = e.currentTarget.value === 'Emergency';
        warning?.classList.toggle('hidden', !isUrgent);
    });

    $$('[data-view]').forEach(b => {
        b.addEventListener('click', () =>
            openDetails(b.dataset.view)
        );
    });

    $$('[data-edit-request]').forEach(b => {
        b.addEventListener('click', () =>
            editRequest(b.dataset.editRequest)
        );
    });

    $$('[data-edit-student]').forEach(b => {
        b.addEventListener('click', () =>
            editStudent(
                b.dataset.editStudent,
                b.dataset.attendance,
                b.dataset.total
            )
        );
    });
}

async function openDetails(id) {
    try {
        const d = await api(`/leave-requests/${id}`);

        const r = d.request;
        const h = d.history || [];

        const canDecide =
            (state.user.role === 'sso' && r.status === 'pending_sso') ||
            (state.user.role === 'dsa' && r.status === 'pending_dsa');

        const canCancel =
            (state.user.role === 'student' &&
                Number(r.student_id) === Number(state.user.id) &&
                ['pending_dsa', 'pending_sso'].includes(r.status));

        $('#dialog-title').textContent = `Request #${r.id}`;

        $('#dialog-body').innerHTML = `
            <div class="detail-list">
                <div class="detail-item">
                    <span>Student</span>
                    <b>${esc(r.student_name)}</b>
                </div>

                <div class="detail-item">
                    <span>College ID</span>
                    <b>${esc(r.student_number || '—')}</b>
                </div>

                <div class="detail-item">
                    <span>Course / programme</span>
                    <b>${esc(r.course || 'Not provided')}</b>
                </div>

                <div class="detail-item">
                    <span>Year of study</span>
                    <b>${esc(r.study_year || 'Not provided')}</b>
                </div>

                <div class="detail-item">
                    <span>Section</span>
                    <b>${esc(r.section || 'Not applicable')}</b>
                </div>

                <div class="detail-item">
                    <span>Hostel</span>
                    <b>${esc(r.hostel_name || 'Not provided')}</b>
                </div>

                <div class="detail-item">
                    <span>Request status</span>
                    ${badge(r.status)}
                </div>

                <div class="detail-item">
                    <span>Attendance value on file (manual)</span>
                    <b>${Number(r.attendance_percent).toFixed(1)}%</b>
                </div>

                <div class="detail-item">
                    <span>Leave type</span>
                    <b>${esc(r.leave_type)}</b>
                </div>

                <div class="detail-item">
                    <span>Working days</span>
                    <b>${days(r)} day(s)</b>
                </div>

                <div class="detail-item">
                    <span>Dates</span>
                    <b>${date(r.start_date)} – ${date(r.end_date)}</b>
                </div>

                <div class="detail-item" style="grid-column:1/-1">
                    <span>Reason</span>
                    <b>${esc(r.reason)}</b>
                </div>
            </div>

            ${r.quota_exceeded
                ? `<div class="notice danger" style="margin-top:16px">
                    This emergency request exceeds the student's remaining leave quota.
                    Final approval requires a DSA override and a recorded justification.
                </div>`
                : ''}

            <hr style="border:0;border-top:1px solid var(--line);margin:22px 0">

            <h3 style="font:700 14px Manrope">Decision history</h3>

            ${h.length
                ? h.map(x => `
                    <div class="history-item">
                        <b>
                            ${esc(roleNames[x.reviewer_role] || x.reviewer_role)}
                            · ${esc(x.decision)}
                        </b>

                        <p>${esc(x.comment || 'No comment added.')}</p>

                        <small>
                            ${esc(x.reviewer_name)}
                            · ${new Date(x.decided_at).toLocaleString()}
                        </small>
                    </div>`).join('')
                : empty(
                    'No decisions yet',
                    'The request has not been reviewed.'
                )}

            ${canDecide
                ? `<form id="decision-form" style="margin-top:20px">
                    <label class="field">
                        Comment
                        <textarea name="comment"
                            placeholder="Add a note${r.status === 'pending_sso'
                                ? ' (optional)'
                                : ' (required for rejection)'}"></textarea>
                    </label>

                    ${r.quota_exceeded && state.user.role === 'dsa'
                        ? `<label class="field">
                            DSA quota override justification
                            <textarea name="quotaOverrideReason" maxlength="1500"
                                placeholder="Required to approve an emergency request over quota"></textarea>
                        </label>`
                        : ''}

                    <div class="form-actions">
                        <button class="btn btn-danger"
                            name="decision" value="rejected">
                            Reject
                        </button>

                        <button class="btn btn-primary"
                            name="decision" value="approved">
                            ${state.user.role === 'sso'
                                ? 'Approve & forward to DSA'
                                : 'Final approve'}
                        </button>
                    </div>
                </form>`
                : ''}

            ${canCancel
                ? `<form id="cancel-form" style="margin-top:18px">
                    <label class="field">
                        Cancellation comment
                        <input name="comment"
                            placeholder="Reason for cancellation (optional)">
                    </label>

                    <div class="form-actions">
                        <button class="btn btn-danger">
                            Cancel my request
                        </button>
                    </div>
                </form>`
                : ''}
        `;

        $('#detail-dialog').showModal();

        $('#decision-form')?.addEventListener('submit', async e => {
            e.preventDefault();

            const submitter = e.submitter;
            const decision = submitter.value;

            const comment =
                new FormData(e.currentTarget).get('comment');
            const quotaOverrideReason =
                new FormData(e.currentTarget).get('quotaOverrideReason');

            if (decision === 'rejected' && !comment.trim()) {
                toast('Add a comment explaining the rejection.', true);
                return;
            }

            if (
                decision === 'approved' &&
                r.quota_exceeded &&
                state.user.role === 'dsa' &&
                !String(quotaOverrideReason || '').trim()
            ) {
                toast('Enter the reason for overriding the leave quota.', true);
                return;
            }

            try {
                const out = await api(`/leave-requests/${id}/decision`, {
                    method: 'POST',
                    body: JSON.stringify({
                        decision,
                        comment,
                        quotaOverrideReason
                    })
                });

                $('#detail-dialog').close();

                toast(out.message);

                await showDashboard();

            } catch (err) {
                toast(err.message, true);
            }
        });

        $('#cancel-form')?.addEventListener('submit', async e => {
            e.preventDefault();

            if (!confirm('Cancel this request?')) return;

            try {
                const out = await api(`/leave-requests/${id}/cancel`, {
                    method: 'POST',
                    body: JSON.stringify({
                        comment: new FormData(e.currentTarget).get('comment')
                    })
                });

                $('#detail-dialog').close();

                toast(out.message);

                await showDashboard();

            } catch (err) {
                toast(err.message, true);
            }
        });

    } catch (e) {
        toast(e.message, true);
    }
}

async function editRequest(id) {
    try {
        const d = await api(`/leave-requests/${id}`);

        const r = d.request;

        $('#dialog-title').textContent = `Edit request #${r.id}`;

        $('#dialog-body').innerHTML = `
            <form id="edit-request-form">
                <div class="form-grid">

                    <label class="field">
                        Leave type
                        <select name="leaveType" required>
                            ${['Personal', 'Medical', 'Family',
                                'Official', 'Emergency', 'Other']
                                .map(x => `
                                    <option ${r.leave_type === x
                                        ? 'selected' : ''}>
                                        ${x}
                                    </option>
                                `).join('')}
                        </select>
                    </label>

                    <label class="field">
                        Start date
                        <input name="startDate" type="date"
                            min="${todayBhutan()}"
                            value="${String(r.start_date).slice(0, 10)}"
                            required>
                    </label>

                    <label class="field">
                        End date
                        <input name="endDate" type="date"
                            min="${todayBhutan()}"
                            value="${String(r.end_date).slice(0, 10)}"
                            required>
                    </label>

                    <label class="field full">
                        Reason
                        <textarea name="reason" required maxlength="1500">${esc(r.reason)}</textarea>
                    </label>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" id="cancel-edit">
                        Close
                    </button>

                    <button class="btn btn-primary" type="submit">
                        Save changes
                    </button>
                </div>
            </form>
        `;

        $('#detail-dialog').showModal();

        $('#cancel-edit').addEventListener('click', () =>
            $('#detail-dialog').close()
        );

        $('#edit-request-form').addEventListener('submit', async e => {
            e.preventDefault();

            try {
                const out = await api(`/leave-requests/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(
                        Object.fromEntries(
                            new FormData(e.currentTarget).entries()
                        )
                    )
                });

                $('#detail-dialog').close();

                toast(out.message);

                await showDashboard();

            } catch (err) {
                toast(err.message, true);
            }
        });

    } catch (e) {
        toast(e.message, true);
    }
}

async function editStudent(id, attendance, total) {
    const a = prompt(
        'Update attendance percentage (0–100):',
        attendance
    );

    if (a === null) return;

    const t = prompt(
        'Total leave allowance in days:',
        total
    );

    if (t === null) return;

    if (
        !Number.isFinite(Number(a)) ||
        Number(a) < 0 ||
        Number(a) > 100 ||
        !Number.isInteger(Number(t)) ||
        Number(t) < 0
    ) {
        toast(
            'Enter valid attendance and non-negative whole leave days.',
            true
        );
        return;
    }

    try {
        const out = await api(`/students/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                attendancePercent: Number(a),
                totalDays: Number(t)
            })
        });

        toast(out.message);

        await showDashboard();

    } catch (e) {
        toast(e.message, true);
    }
}

// CLOSE DIALOG AND LOGOUT
$('#close-dialog').addEventListener('click', () =>
    $('#detail-dialog').close()
);

$('#logout-btn').addEventListener('click', logout);

$$('[data-auth-tab]').forEach(b => {
    b.addEventListener('click', () =>
        showAuthTab(b.dataset.authTab)
    );
});

// LOGIN
$('#login-form').addEventListener('submit', async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    try {
        const out = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: f.get('email'),
                password: f.get('password'),
                role: $('#login-role').value
            })
        });

        setLoggedIn(out.user, out.token);

        toast('Signed in successfully.');

    } catch (err) {
        toast(err.message, true);
    }
});

// STUDENT REGISTRATION
$('#register-form').addEventListener('submit', async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    try {
        const out = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify(Object.fromEntries(f.entries()))
        });

        e.currentTarget.reset();

        showAuthTab('login');

        toast(
            'Account registration successful! ' +
            (out.message || 'Please verify your email before logging in.')
        );

    } catch (err) {
        toast(err.message, true);
    }
});

// RESEND VERIFICATION EMAIL
$('#resend-verification-btn').addEventListener('click', async () => {
    const email = $('#login-form [name="email"]').value.trim();

    const button = $('#resend-verification-btn');
    const message = $('#resend-message');

    if (!email) {
        message.textContent = 'Please enter your college email first.';
        message.style.color = 'red';
        return;
    }

    try {
        button.disabled = true;
        button.textContent = 'Sending...';

        message.textContent = '';

        const result = await api('/auth/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        message.textContent =
            result.message ||
            'Verification email sent. Please check your inbox.';

        message.style.color = 'green';

    } catch (error) {
        message.textContent = error.message;
        message.style.color = 'red';

    } finally {
        button.disabled = false;
        button.textContent = 'Resend Verification Email';
    }
});

// CHECK DATABASE CONNECTION
async function health() {
    try {
        const h = await fetch('/api/health').then(r => r.json());

        const el = $('#api-status');

        if (h.database === 'connected') {
            el.textContent = 'Database connected';
            el.classList.remove('offline');
        } else {
            el.textContent = 'Database disconnected';
            el.classList.add('offline');
        }

    } catch {
        $('#api-status').textContent = 'API unavailable';
        $('#api-status').classList.add('offline');
    }
}

health();

if (state.token && state.user) {
    showDashboard();
}
