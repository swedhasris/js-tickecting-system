<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Web\AuthController;
use App\Http\Controllers\Web\DashboardController;
use App\Http\Controllers\Web\TicketWebController;
use App\Http\Controllers\Web\UserWebController;
use App\Http\Controllers\Web\ReportController;
use App\Http\Controllers\Web\SettingsController;
use App\Http\Controllers\Web\TimesheetController;
use App\Http\Controllers\Web\ActivityTrackerController;
use App\Http\Controllers\Web\AdminController;
use App\Http\Controllers\Web\InertiaPageController;

/*
|--------------------------------------------------------------------------
| Authentication Routes (unauthenticated)
|--------------------------------------------------------------------------
*/
Route::middleware('guest')->group(function () {
    Route::get('/login',    [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login',   [AuthController::class, 'login'])->name('login.post');
    Route::get('/register', [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register',[AuthController::class, 'register'])->name('register.post');
});

Route::post('/logout', [AuthController::class, 'logout'])->name('logout')->middleware('auth');

/*
|--------------------------------------------------------------------------
| Authenticated Application Routes
| All served as Inertia responses — preserves 100% of the React UI
|--------------------------------------------------------------------------
*/
Route::middleware('auth')->group(function () {

    // ── Main Dashboard ────────────────────────────────────────────────────────
    Route::get('/',             [DashboardController::class, 'index'])->name('dashboard');
    Route::get('/my-dashboard', [DashboardController::class, 'myDashboard'])->name('my-dashboard');

    // ── Tickets ───────────────────────────────────────────────────────────────
    Route::get('/tickets',      [TicketWebController::class, 'index'])->name('tickets');
    Route::get('/tickets/{id}', [TicketWebController::class, 'show'])->name('tickets.show');

    // ── ITSM Management Pages ─────────────────────────────────────────────────
    Route::get('/catalog',  [InertiaPageController::class, 'serviceCatalog'])->name('catalog');
    Route::get('/kb',       [InertiaPageController::class, 'knowledgeBase'])->name('kb');
    Route::get('/sla',      [InertiaPageController::class, 'slaManagement'])->name('sla');
    Route::get('/history',  [InertiaPageController::class, 'globalHistory'])->name('history');
    Route::get('/reports',  [ReportController::class, 'index'])->name('reports');
    Route::get('/calendar', [InertiaPageController::class, 'calendar'])->name('calendar');
    Route::get('/leaderboard', [InertiaPageController::class, 'leaderboard'])->name('leaderboard');
    Route::get('/approvals', [InertiaPageController::class, 'approvals'])->name('approvals');
    Route::get('/problem',  [InertiaPageController::class, 'problemManagement'])->name('problem');
    Route::get('/change',   [InertiaPageController::class, 'changeManagement'])->name('change');
    Route::get('/cmdb',     [InertiaPageController::class, 'cmdb'])->name('cmdb');
    Route::get('/conversations', [InertiaPageController::class, 'conversations'])->name('conversations');
    Route::get('/data-analytics', [InertiaPageController::class, 'dataAnalytics'])->name('data-analytics');

    // ── Timesheet & Activity ──────────────────────────────────────────────────
    Route::get('/timesheet',              [TimesheetController::class, 'index'])->name('timesheet');
    Route::get('/timesheet/weekly',       [TimesheetController::class, 'weekly'])->name('timesheet.weekly');
    Route::get('/timesheet/reports',      [TimesheetController::class, 'reports'])->name('timesheet.reports');
    Route::get('/timesheet/approvals',    [TimesheetController::class, 'approvals'])->name('timesheet.approvals');
    Route::get('/activity-tracker',       [ActivityTrackerController::class, 'index'])->name('activity-tracker');

    // ── Service Portal (for end users) ────────────────────────────────────────
    Route::get('/portal', [InertiaPageController::class, 'servicePortal'])->name('portal');

    // ── Administration ────────────────────────────────────────────────────────
    Route::middleware('role:admin,super_admin,ultra_super_admin')->group(function () {
        Route::get('/users',         [UserWebController::class, 'index'])->name('users');
        Route::get('/access-control',[AdminController::class, 'accessControl'])->name('access-control');
        Route::get('/groups',        [AdminController::class, 'groups'])->name('groups');
        Route::get('/settings',      [SettingsController::class, 'index'])->name('settings');
        Route::get('/branding',      [SettingsController::class, 'branding'])->name('branding');
        Route::get('/custom-dropdowns', [SettingsController::class, 'customDropdowns'])->name('custom-dropdowns');
        Route::get('/incident-categories', [SettingsController::class, 'incidentCategories'])->name('incident-categories');
        Route::get('/approved-tickets', [TicketWebController::class, 'approved'])->name('approved-tickets');
        Route::get('/companies',     [AdminController::class, 'companies'])->name('companies');
        Route::get('/companies/{id}', [AdminController::class, 'showCompany'])->name('companies.show');
    });

    // ── Email Integration (ultra_super_admin only) ─────────────────────────────
    Route::middleware('role:ultra_super_admin')->group(function () {
        Route::get('/email-integrations', [AdminController::class, 'emailIntegrations'])->name('email-integrations');
        Route::get('/m365-monitor',       [AdminController::class, 'm365Monitor'])->name('m365-monitor');
    });
});
