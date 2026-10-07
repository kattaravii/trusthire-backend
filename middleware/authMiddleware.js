const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7, authHeader.length) : authHeader;

        if (!token) {
            return res.status(401).json({ error: 'Access denied. Malformed token.' });
        }

        const secret = process.env.JWT_SECRET || 'fallback_secret';
        const verified = jwt.verify(token, secret);
        
        req.user = verified; 
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        res.status(401).json({ error: 'Invalid token.' });
    }
};