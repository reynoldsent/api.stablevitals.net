/**
 * RBAC middleware factory.
 *
 * Usage:
 *   router.get('/something', authenticate, requireRole('all_access', 'basic_access'), handler)
 *
 * Role hierarchy (highest to lowest):
 *   all_access > basic_access > view_only
 */

const ROLE_RANK = {
  all_access: 3,
  basic_access: 2,
  view_only: 1,
};

/**
 * Returns middleware that passes if req.user.role is in the allowedRoles list.
 * @param {...string} allowedRoles
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for this action',
      });
    }
    next();
  };
};

/**
 * Returns middleware that passes if the user's role rank is >= the minimum rank.
 * Useful for "at least basic_access" style checks.
 * @param {string} minimumRole
 */
const requireMinRole = (minimumRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const userRank = ROLE_RANK[req.user.role] || 0;
    const minRank = ROLE_RANK[minimumRole] || 0;
    if (userRank < minRank) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for this action',
      });
    }
    next();
  };
};

module.exports = { requireRole, requireMinRole };
