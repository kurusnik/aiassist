// services/passwordManager.js
// Модуль для управления безопасным изменением паролей
const bcrypt = require('bcrypt');
const pool = require('../db');

class PasswordManager {
    
    /**
     * Валидация пароля
     * @param {string} password - Пароль для валидации
     * @returns {Object} {valid: boolean, errors: string[]}
     */
    static validatePassword(password) {
        const errors = [];
        
        if (!password || password.length < 8) {
            errors.push('Пароль должен содержать минимум 8 символов');
        }
        
        if (password.length > 100) {
            errors.push('Пароль не должен превышать 100 символов');
        }
        
        // Минимальная валидация - только проверка длины
        // Отключена сложная валидация по требованию пользователя
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * Проверка лимита попыток изменения пароля
     * @param {number} userId - ID пользователя
     * @param {string} ipAddress - IP адрес
     * @returns {Object} {allowed: boolean, remainingAttempts: number, timeLeft: number}
     */
    static async checkRateLimit(userId, ipAddress) {
        try {
            const MAX_ATTEMPTS = 5;
            const TIME_WINDOW_MINUTES = 15;
            
            const result = await pool.query(
                `SELECT attempt_count, last_attempt_at 
                 FROM password_change_attempts 
                 WHERE user_id = $1 AND ip_address = $2`,
                [userId, ipAddress]
            );
            
            if (result.rows.length === 0) {
                return {
                    allowed: true,
                    remainingAttempts: MAX_ATTEMPTS,
                    timeLeft: 0
                };
            }
            
            const attempt = result.rows[0];
            const now = new Date();
            const lastAttempt = new Date(attempt.last_attempt_at);
            const minutesDiff = (now - lastAttempt) / (1000 * 60);
            
            // Если прошло больше TIME_WINDOW_MINUTES, сбрасываем счетчик
            if (minutesDiff > TIME_WINDOW_MINUTES) {
                await pool.query(
                    `DELETE FROM password_change_attempts 
                     WHERE user_id = $1 AND ip_address = $2`,
                    [userId, ipAddress]
                );
                
                return {
                    allowed: true,
                    remainingAttempts: MAX_ATTEMPTS,
                    timeLeft: 0
                };
            }
            
            const remainingAttempts = MAX_ATTEMPTS - attempt.attempt_count;
            
            return {
                allowed: attempt.attempt_count < MAX_ATTEMPTS,
                remainingAttempts: Math.max(0, remainingAttempts),
                timeLeft: Math.ceil(TIME_WINDOW_MINUTES - minutesDiff)
            };
            
        } catch (error) {
            console.error('Error checking rate limit:', error);
            return {
                allowed: true,
                remainingAttempts: 5,
                timeLeft: 0
            };
        }
    }
    
    /**
     * Увеличение счетчика попыток
     * @param {number} userId - ID пользователя
     * @param {string} ipAddress - IP адрес
     */
    static async incrementAttemptCount(userId, ipAddress) {
        try {
            await pool.query(
                `INSERT INTO password_change_attempts (user_id, ip_address, attempt_count, last_attempt_at)
                 VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id, ip_address) 
                 DO UPDATE SET 
                     attempt_count = password_change_attempts.attempt_count + 1,
                     last_attempt_at = CURRENT_TIMESTAMP`,
                [userId, ipAddress]
            );
        } catch (error) {
            console.error('Error incrementing attempt count:', error);
        }
    }
    
    /**
     * Сброс счетчика попыток
     * @param {number} userId - ID пользователя
     * @param {string} ipAddress - IP адрес
     */
    static async resetAttemptCount(userId, ipAddress) {
        try {
            await pool.query(
                `DELETE FROM password_change_attempts 
                 WHERE user_id = $1 AND ip_address = $2`,
                [userId, ipAddress]
            );
        } catch (error) {
            console.error('Error resetting attempt count:', error);
        }
    }
    
    /**
     * Логирование попытки изменения пароля
     * @param {Object} logData - Данные для логирования
     */
    static async logPasswordChange(logData) {
        try {
            const {
                userId,
                changedByUserId = null,
                ipAddress,
                userAgent = null,
                success = false,
                errorMessage = null
            } = logData;
            
            await pool.query(
                `INSERT INTO password_change_logs 
                 (user_id, changed_by_user_id, ip_address, user_agent, success, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, changedByUserId, ipAddress, userAgent, success, errorMessage]
            );
        } catch (error) {
            console.error('Error logging password change:', error);
        }
    }
    
    /**
     * Проверка текущего пароля
     * @param {number} userId - ID пользователя
     * @param {string} currentPassword - Текущий пароль
     * @returns {boolean}
     */
    static async verifyCurrentPassword(userId, currentPassword) {
        try {
            console.log('[DEBUG] Проверка пароля для userId:', userId);
            
            const result = await pool.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [userId]
            );
            
            console.log('[DEBUG] Результат запроса пользователя:', result.rows.length, 'записей');
            
            if (result.rows.length === 0) {
                console.log('[DEBUG] Пользователь не найден в базе данных');
                return false;
            }
            
            const passwordHash = result.rows[0].password_hash;
            console.log('[DEBUG] Хеш пароля найден, длина:', passwordHash ? passwordHash.length : 0);
            
            const isValid = await bcrypt.compare(currentPassword, passwordHash);
            console.log('[DEBUG] Пароль верен:', isValid);
            
            return isValid;
            
        } catch (error) {
            console.error('Error verifying current password:', error);
            return false;
        }
    }
    
    /**
     * Проверка, не использовался ли пароль ранее
     * @param {number} userId - ID пользователя
     * @param {string} newPassword - Новый пароль
     * @returns {boolean}
     */
    static async checkPreviousPasswords(userId, newPassword) {
        try {
            // Пока реализуем базовую проверку - сравниваем с текущим паролем
            const result = await pool.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                return false;
            }
            
            const currentHash = result.rows[0].password_hash;
            const isSameAsCurrent = await bcrypt.compare(newPassword, currentHash);
            
            return isSameAsCurrent; // true если пароль совпадает с текущим
            
        } catch (error) {
            console.error('Error checking previous passwords:', error);
            return false;
        }
    }
    
    /**
     * Изменение пароля пользователя
     * @param {number} userId - ID пользователя
     * @param {string} newPassword - Новый пароль
     * @param {number} changedByUserId - ID пользователя, который меняет пароль (null если сам пользователь)
     * @returns {boolean}
     */
    static async changePassword(userId, newPassword, changedByUserId = null) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Хеширование нового пароля
            const saltRounds = 12; // Увеличиваем для большей безопасности
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
            
            // Обновление пароля в базе данных
            await client.query(
                `UPDATE users 
                 SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [newPasswordHash, userId]
            );
            
            await client.query('COMMIT');
            return true;
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error changing password:', error);
            return false;
        } finally {
            client.release();
        }
    }
    
    /**
     * Получение информации о пользователе (для админов)
     * @param {number} userId - ID пользователя
     * @returns {Object|null}
     */
    static async getUserInfo(userId) {
        try {
            const result = await pool.query(
                `SELECT id, username, email, name, is_admin, is_approved,
                        created_at, password_changed_at
                 FROM users WHERE id = $1`,
                [userId]
            );
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const user = result.rows[0];
            // Убираем чувствительную информацию
            delete user.password_hash;
            
            return user;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }
    
    /**
     * Получение логов изменения пароля пользователя (для админов)
     * @param {number} userId - ID пользователя (опционально)
     * @param {number} limit - Лимит записей
     * @returns {Array}
     */
    static async getPasswordChangeLogs(userId = null, limit = 50) {
        try {
            if (userId) {
                const result = await pool.query(
                    `SELECT pcl.*, 
                            u.username as user_username,
                            cu.username as changed_by_username
                     FROM password_change_logs pcl
                     LEFT JOIN users u ON pcl.user_id = u.id
                     LEFT JOIN users cu ON pcl.changed_by_user_id = cu.id
                     WHERE pcl.user_id = $1
                     ORDER BY pcl.created_at DESC
                     LIMIT $2`,
                    [userId, limit]
                );
                
                return result.rows;
            } else {
                const result = await pool.query(
                    `SELECT pcl.*, 
                            u.username as user_username,
                            cu.username as changed_by_username
                     FROM password_change_logs pcl
                     LEFT JOIN users u ON pcl.user_id = u.id
                     LEFT JOIN users cu ON pcl.changed_by_user_id = cu.id
                     ORDER BY pcl.created_at DESC
                     LIMIT $1`,
                    [limit]
                );
                
                return result.rows;
            }
        } catch (error) {
            console.error('Error getting password change logs:', error);
            return [];
        }
    }
}

module.exports = PasswordManager;