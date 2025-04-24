using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using NeuroMotion_API;
using NeuroMotion_API.Models;

namespace NeuroMotionAPITests
{
    [TestClass]
    public sealed class UserControllerTests
    {
        private Mock<ApplicationDbContext> _mockContext;
        private UserController _controller;

        [TestInitialize]
        public void Setup()
        {
            _mockContext = new Mock<ApplicationDbContext>();
            _controller = new UserController(_mockContext.Object);
        }

        private Mock<DbSet<T>> CreateMockDbSet<T>(IEnumerable<T> data) where T : class
        {
            var queryable = data.AsQueryable();
            var mockSet = new Mock<DbSet<T>>();
            mockSet.As<IQueryable<T>>().Setup(m => m.Provider).Returns(queryable.Provider);
            mockSet.As<IQueryable<T>>().Setup(m => m.Expression).Returns(queryable.Expression);
            mockSet.As<IQueryable<T>>().Setup(m => m.ElementType).Returns(queryable.ElementType);
            mockSet.As<IQueryable<T>>().Setup(m => m.GetEnumerator()).Returns(queryable.GetEnumerator());
            return mockSet;
        }

        [TestMethod]
        public async Task Register_UserAlreadyExists_ReturnsConflict()
        {
            // Arrange
            var request = new RegisterRequest
            {
                Name = "Test User",
                Email = "test@example.com",
                Role = "User",
                Password = "Password123"
            };

            var users = new List<User>
            {
                new User { Email = "test@example.com" }
            };

            var mockDbSet = CreateMockDbSet(users);
            _mockContext.Setup(c => c.Users).Returns(mockDbSet.Object);

            // Act
            var result = await _controller.Register(request);

            // Assert
            Assert.IsInstanceOfType(result, typeof(ConflictObjectResult));
        }

        [TestMethod]
        public async Task Register_NewUser_ReturnsOk()
        {
            // Arrange
            var request = new RegisterRequest
            {
                Name = "Test User",
                Email = "newuser@example.com",
                Role = "User",
                Password = "Password123"
            };

            var users = new List<User>();
            var mockDbSet = CreateMockDbSet(users);
            _mockContext.Setup(c => c.Users).Returns(mockDbSet.Object);

            // Act
            var result = await _controller.Register(request);

            // Assert
            Assert.IsInstanceOfType(result, typeof(OkObjectResult));
        }

        [TestMethod]
        public async Task Login_InvalidCredentials_ReturnsUnauthorized()
        {
            // Arrange
            var request = new LoginRequest
            {
                Email = "test@example.com",
                Password = "WrongPassword"
            };

            var users = new List<User>
            {
                new User
                {
                    Email = "test@example.com",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("CorrectPassword")
                }
            };

            var mockDbSet = CreateMockDbSet(users);
            _mockContext.Setup(c => c.Users).Returns(mockDbSet.Object);

            // Act
            var result = await _controller.Login(request);

            // Assert
            Assert.IsInstanceOfType(result, typeof(UnauthorizedResult));
        }

        [TestMethod]
        public async Task Login_ValidCredentials_ReturnsOk()
        {
            // Arrange
            var request = new LoginRequest
            {
                Email = "test@example.com",
                Password = "CorrectPassword"
            };

            var users = new List<User>
            {
                new User
                {
                    Id = 1,
                    Name = "Test User",
                    Email = "test@example.com",
                    Role = "User",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("CorrectPassword")
                }
            };

            var mockDbSet = CreateMockDbSet(users);
            _mockContext.Setup(c => c.Users).Returns(mockDbSet.Object);

            // Act
            var result = await _controller.Login(request);

            // Assert
            Assert.IsInstanceOfType(result, typeof(OkObjectResult));
        }
    }
}
