const { AdminModel, hashPassword, verifyPassword } = require("../models/Admin");
const { TwoFactorService } = require("./twoFactorService");

class AdminService {
  static async findByEmail(email) {
    return AdminModel.findByEmail(email);
  }

  static async findById(id) {
    return AdminModel.findById(id);
  }

  static async getAll() {
    return AdminModel.getAll();
  }

  static async createAdmin({ name, email, password, role = "admin" }) {
    const two_factor_secret = TwoFactorService.createSecret();
    return AdminModel.create({
      name,
      email,
      password,
      role,
      two_factor_secret,
    });
  }

  static async updateAdmin(id, updates) {
    return AdminModel.update(id, updates);
  }

  static async deleteAdmin(id) {
    return AdminModel.delete(id);
  }
}

module.exports = {
  AdminService,
  hashPassword,
  verifyPassword,
};
