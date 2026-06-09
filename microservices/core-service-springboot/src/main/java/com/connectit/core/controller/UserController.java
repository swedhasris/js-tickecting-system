package com.connectit.core.controller;

import com.connectit.core.model.User;
import com.connectit.core.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    @GetMapping("/{uid}")
    public ResponseEntity<?> getUserByUid(@PathVariable String uid) {
        Optional<User> user = userRepository.findByUid(uid);
        if (user.isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "User not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
        }
        return ResponseEntity.ok(user.get());
    }

    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody Map<String, Object> body) {
        String email = (String) body.get("email");
        String name = (String) body.get("name");

        if (email == null || name == null) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Email and name are required");
            return ResponseEntity.badRequest().body(err);
        }

        if (userRepository.findByEmail(email.trim().toLowerCase()).isPresent()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Email already exists");
            return ResponseEntity.badRequest().body(err);
        }

        User user = new User();
        user.setUid((String) body.getOrDefault("uid", "u_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16)));
        user.setName(name);
        user.setEmail(email.trim().toLowerCase());
        user.setRole((String) body.getOrDefault("role", "user"));
        user.setPhone((String) body.get("phone"));
        user.setDepartment((String) body.get("department"));
        user.setIsActive((Boolean) body.getOrDefault("isActive", true));
        user.setIsDemo((Boolean) body.getOrDefault("isDemo", false));
        
        String pass = (String) body.get("password");
        if (pass != null) {
            user.setPasswordHash(simpleHash(pass));
        } else {
            user.setPasswordHash((String) body.get("password_hash"));
        }

        User savedUser = userRepository.save(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedUser);
    }

    @PutMapping("/{uid}")
    public ResponseEntity<?> updateUser(@PathVariable String uid, @RequestBody Map<String, Object> body) {
        Optional<User> userOpt = userRepository.findByUid(uid);
        if (userOpt.isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "User not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
        }

        User user = userOpt.get();
        if (body.containsKey("name")) user.setName((String) body.get("name"));
        if (body.containsKey("phone")) user.setPhone((String) body.get("phone"));
        if (body.containsKey("department")) user.setDepartment((String) body.get("department"));
        if (body.containsKey("role")) user.setRole((String) body.get("role"));
        if (body.containsKey("isActive")) user.setIsActive((Boolean) body.get("isActive"));

        if (body.containsKey("password")) {
            user.setPasswordHash(simpleHash((String) body.get("password")));
        }

        User updatedUser = userRepository.save(user);
        return ResponseEntity.ok(updatedUser);
    }

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
