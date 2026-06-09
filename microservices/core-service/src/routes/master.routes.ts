import { Router } from 'express';
import { query, execute, formatDate } from '../lib/db.js';

const router = Router();

const VALID_TABLES = new Set([
  'mst_groups','mst_statuses','mst_roles','mst_departments','mst_ticket_types',
  'mst_projects','mst_priorities','mst_sources','mst_tags','mst_categories',
  'mst_subcategories','mst_providences','mst_members',
]);

// ── Custom Dropdowns ──────────────────────────────────────────────────────────

router.get('/custom-dropdowns', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM custom_dropdowns ORDER BY created_at ASC');
    res.json(rows.map((r: any) => ({
      id: r.id, name: r.name, label: r.label,
      options: JSON.parse(r.options_json || '[]'),
      enabledForAll: Boolean(r.enabled_for_all),
      enabledCompanyIds: JSON.parse(r.enabled_company_ids_json || '[]'),
      isRequired: Boolean(r.is_required), isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/custom-dropdowns', async (req, res) => {
  try {
    const id = `dd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { name, label, options = [], enabledForAll = true, enabledCompanyIds = [], isRequired = false, isActive = true } = req.body;
    await execute(
      'INSERT INTO custom_dropdowns (id, name, label, options_json, enabled_for_all, enabled_company_ids_json, is_required, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, label, JSON.stringify(options), enabledForAll?1:0, JSON.stringify(enabledCompanyIds), isRequired?1:0, isActive?1:0]
    );
    res.json({ id, name, label, options, enabledForAll, enabledCompanyIds, isRequired, isActive });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/custom-dropdowns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, label, options = [], enabledForAll = true, enabledCompanyIds = [], isRequired = false, isActive = true } = req.body;
    await execute(
      'UPDATE custom_dropdowns SET name=?, label=?, options_json=?, enabled_for_all=?, enabled_company_ids_json=?, is_required=?, is_active=?, updated_at=? WHERE id=?',
      [name, label, JSON.stringify(options), enabledForAll?1:0, JSON.stringify(enabledCompanyIds), isRequired?1:0, isActive?1:0, formatDate(new Date()), id]
    );
    res.json({ id, name, label, options, enabledForAll, enabledCompanyIds, isRequired, isActive });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/custom-dropdowns/:id', async (req, res) => {
  try {
    await execute('DELETE FROM custom_dropdowns WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/custom-dropdowns/active', async (req, res) => {
  try {
    const { company_id } = req.query;
    const rows = await query('SELECT * FROM custom_dropdowns WHERE is_active = 1 ORDER BY created_at ASC');
    const result = rows.map((r: any) => ({
      id: r.id, name: r.name, label: r.label,
      options: JSON.parse(r.options_json || '[]'),
      enabledForAll: Boolean(r.enabled_for_all),
      enabledCompanyIds: JSON.parse(r.enabled_company_ids_json || '[]'),
      isRequired: Boolean(r.is_required),
    })).filter((d: any) => !company_id ? d.enabledForAll : d.enabledForAll || d.enabledCompanyIds.includes(company_id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Incident Categories ───────────────────────────────────────────────────────

router.get('/incident-categories', async (req, res) => {
  try {
    const activeOnly = req.query.active_only === 'true';
    let sql = 'SELECT * FROM incident_categories';
    if (activeOnly) sql += " WHERE status = 'Active'";
    sql += ' ORDER BY name ASC';
    const rows = await query(sql);
    res.json(rows.map((c: any) => ({ id: c.id.toString(), ...c })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/incident-categories', async (req, res) => {
  try {
    let { name, description, status, created_by } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    name = name.trim(); status = status || 'Active';
    const existing = await query('SELECT id FROM incident_categories WHERE LOWER(name) = ?', [name.toLowerCase()]);
    if (existing.length) return res.status(400).json({ error: 'Category already exists' });
    const result = await execute(
      'INSERT INTO incident_categories (name, description, status, created_by, last_updated_by) VALUES (?, ?, ?, ?, ?)',
      [name, description || '', status, created_by || 'Admin', created_by || 'Admin']
    );
    res.json({ id: result.insertId.toString(), name, description, status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/incident-categories/:id', async (req, res) => {
  try {
    let { name, description, status, last_updated_by } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    name = name.trim(); status = status || 'Active';
    const dup = await query('SELECT id FROM incident_categories WHERE LOWER(name) = ? AND id != ?', [name.toLowerCase(), req.params.id]);
    if (dup.length) return res.status(400).json({ error: 'Category already exists' });
    await execute('UPDATE incident_categories SET name=?, description=?, status=?, last_updated_by=?, last_updated_date=CURRENT_TIMESTAMP WHERE id=?',
      [name, description || '', status, last_updated_by || 'Admin', req.params.id]);
    res.json({ id: req.params.id, name, status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/incident-categories/:id', async (req, res) => {
  try {
    const [cat] = await query('SELECT name FROM incident_categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const [active] = await query(
      "SELECT COUNT(*) as count FROM tickets WHERE (incident_category = ? OR category = ?) AND status NOT IN ('Resolved','Closed','Canceled')",
      [cat.name, cat.name]
    );
    if (active?.count > 0) return res.status(400).json({ error: 'Category used by active tickets' });
    await execute('DELETE FROM incident_categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/incident-categories/options', async (req, res) => {
  try {
    const { category_id, active_only } = req.query;
    let sql = 'SELECT * FROM incident_category_options WHERE 1=1';
    const params: any[] = [];
    if (category_id)          { sql += ' AND category_id = ?'; params.push(category_id); }
    if (active_only === 'true') sql += " AND status = 'Active'";
    sql += ' ORDER BY value_text ASC';
    const rows = await query(sql, params);
    res.json(rows.map((o: any) => ({ id: o.id.toString(), ...o })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/incident-categories/options', async (req, res) => {
  try {
    let { category_id, value_text, status, created_by } = req.body;
    if (!category_id || !value_text?.trim()) return res.status(400).json({ error: 'category_id and value_text required' });
    value_text = value_text.trim(); status = status || 'Active';
    const dup = await query('SELECT id FROM incident_category_options WHERE category_id = ? AND LOWER(value_text) = ?', [category_id, value_text.toLowerCase()]);
    if (dup.length) return res.status(400).json({ error: 'Value already exists' });
    const result = await execute(
      'INSERT INTO incident_category_options (category_id, value_text, status, created_by, last_updated_by) VALUES (?, ?, ?, ?, ?)',
      [category_id, value_text, status, created_by || 'Admin', created_by || 'Admin']
    );
    res.json({ id: result.insertId.toString(), category_id, value_text, status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/incident-categories/options/:id', async (req, res) => {
  try {
    let { value_text, status, last_updated_by } = req.body;
    if (!value_text?.trim()) return res.status(400).json({ error: 'value_text required' });
    value_text = value_text.trim(); status = status || 'Active';
    await execute('UPDATE incident_category_options SET value_text=?, status=?, last_updated_by=?, last_updated_date=CURRENT_TIMESTAMP WHERE id=?',
      [value_text, status, last_updated_by || 'Admin', req.params.id]);
    res.json({ id: req.params.id, value_text, status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/incident-categories/options/:id', async (req, res) => {
  try {
    await execute('DELETE FROM incident_category_options WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Master Data (generic CRUD) ────────────────────────────────────────────────

router.get('/master-data/:table', async (req, res) => {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
    const { status, search, sort = 'name', order = 'ASC', category_id, subcategory_id, group_id } = req.query;

    let sql = `SELECT * FROM ${table} WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (category_id    && table === 'mst_subcategories') { sql += ' AND category_id = ?'; params.push(category_id); }
    if (subcategory_id && table === 'mst_providences')   { sql += ' AND subcategory_id = ?'; params.push(subcategory_id); }
    if (group_id       && table === 'mst_members')        { sql += ' AND group_id = ?'; params.push(group_id); }

    const safeSort  = ['name','created_at','id','level','status'].includes(sort as string) ? sort : 'name';
    const safeOrder = order === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${safeSort} ${safeOrder}`;

    const rows = await query(sql, params);
    res.json(rows.map((r: any) => ({ ...r, id: r.id.toString() })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/master-data/:table', async (req, res) => {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
    const fields = Object.keys(req.body).filter(k => k !== 'id');
    const result = await execute(
      `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map(k => req.body[k])
    );
    const [row] = await query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
    res.json({ ...row, id: result.insertId.toString() });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Entry already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/master-data/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'created_at');
    await execute(
      `UPDATE ${table} SET ${fields.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(k => req.body[k]), id]
    );
    const [row] = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json({ ...row, id: id.toString() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/master-data/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
    if (req.query.permanent === 'true') {
      await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
      res.json({ message: 'Deleted permanently' });
    } else {
      const [row] = await query(`SELECT status FROM ${table} WHERE id = ?`, [id]);
      const newStatus = row?.status === 'active' ? 'inactive' : 'active';
      await execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [newStatus, id]);
      res.json({ status: newStatus });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Companies & Feature Permissions ──────────────────────────────────────────

router.get('/companies', async (_req, res) => {
  try {
    try {
      const rows = await query('SELECT id, name FROM companies ORDER BY name ASC');
      res.json(rows.map((r: any) => ({ id: r.id.toString(), name: r.name })));
    } catch {
      res.json([
        { id: '1', name: 'Technosprint' },
        { id: '2', name: 'Acme Corp' },
        { id: '3', name: 'Global Tech' },
      ]);
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/feature-permissions', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    const rows = await query('SELECT * FROM company_feature_permissions WHERE company_id = ?', [company_id]);
    res.json(rows.map((r: any) => ({
      companyId: r.company_id, featureId: r.feature_id,
      canView: Boolean(r.can_view), canUse: Boolean(r.can_use), canEdit: Boolean(r.can_edit),
    })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/feature-permissions', async (req, res) => {
  try {
    const { companyId, featureId, canView, canUse, canEdit } = req.body;
    const existing = await query('SELECT id FROM company_feature_permissions WHERE company_id = ? AND feature_id = ?', [companyId, featureId]);
    if (existing.length) {
      await execute('UPDATE company_feature_permissions SET can_view=?, can_use=?, can_edit=? WHERE company_id=? AND feature_id=?',
        [canView?1:0, canUse?1:0, canEdit?1:0, companyId, featureId]);
    } else {
      await execute('INSERT INTO company_feature_permissions (company_id, feature_id, can_view, can_use, can_edit) VALUES (?, ?, ?, ?, ?)',
        [companyId, featureId, canView?1:0, canUse?1:0, canEdit?1:0]);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
