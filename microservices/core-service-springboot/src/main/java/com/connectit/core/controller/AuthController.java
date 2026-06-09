package com.connectit.core.controller;

import com.connectit.core.config.JwtUtil;
import com.connectit.core.model.User;
import com.connectit.core.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String password = request.get("password");

        if (email == null || password == null) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Email and password are required");
            return ResponseEntity.badRequest().body(err);
        }

        Optional<User> userOpt = userRepository.findByEmail(email.trim().toLowerCase());
        if (userOpt.isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Invalid email or password");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(err);
        }

        User user = userOpt.get();
        if (!user.getIsActive()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "User account is suspended");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(err);
        }

        // Verify password using legacy simple hash algorithm
        String calculatedHash = simpleHash(password);
        if (user.getPasswordHash() != null && !user.getPasswordHash().equals(calculatedHash)) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Invalid email or password");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(err);
        }

        // Update last login
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);

        // Generate JWT
        String token = jwtUtil.generateToken(user.getEmail(), user.getRole(), user.getUid());

        // Serialize user payload matching legacy API contracts
        Map<String, Object> response = new HashMap<>();
        response.put("id", user.getId().toString());
        response.put("uid", user.getUid());
        response.put("name", user.getName());
        response.put("email", user.getEmail());
        response.put("role", user.getRole());
        response.put("phone", user.getPhone());
        response.put("department", user.getDepartment());
        response.put("isActive", user.getIsActive());
        response.put("isDemo", user.getIsDemo());
        response.put("lastLogin", user.getLastLogin());
        response.put("token", token);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String password = request.get("password");
        String name = request.get("name");

        if (email == null || password == null || name == null) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Email, password, and name are required");
            return ResponseEntity.badRequest().body(err);
        }

        if (userRepository.findByEmail(email.trim().toLowerCase()).isPresent()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Email already exists");
            return ResponseEntity.badRequest().body(err);
        }

        User user = new User();
        user.setUid("u_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        user.setEmail(email.trim().toLowerCase());
        user.setName(name);
        user.setPasswordHash(simpleHash(password));
        user.setRole("user");
        user.setIsActive(true);
        user.setIsDemo(false);
        user.setProvider("email");
        
        User savedUser = userRepository.save(user);

        Map<String, Object> response = new HashMap<>();
        response.put("id", savedUser.getId().toString());
        response.put("uid", savedUser.getUid());
        response.put("name", savedUser.getName());
        response.put("email", savedUser.getEmail());
        response.put("role", savedUser.getRole());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Helper simpleHash implementation matching PHP and Node simpleHash functions
     */
    private String simpleHash(String value) {
        if (value == null) return null;
        int hash = 0;
        int length = value.length();
        for (int i = 0; i < length; i++) {
            int charCode = value.charAt(i);
            hash = ((hash << 5) - hash) + charCode;
        }
        String base36 = Integer.toString(Math.abs(hash), 36);
        return "h_" + base36 + "_" + length;
    }
}
