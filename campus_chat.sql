-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 06, 2026 at 02:32 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `campus_chat`
--

-- --------------------------------------------------------

--
-- Table structure for table `announcements`
--

CREATE TABLE `announcements` (
  `id` int(10) UNSIGNED NOT NULL,
  `author_id` int(10) UNSIGNED NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `target_type` enum('all','department') NOT NULL DEFAULT 'all',
  `department` varchar(120) DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `approved_by` int(10) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `announcements`
--

INSERT INTO `announcements` (`id`, `author_id`, `title`, `body`, `priority`, `target_type`, `department`, `status`, `approved_by`, `approved_at`, `created_at`, `updated_at`) VALUES
(1, 6, 'test', 'test', 'urgent', 'all', NULL, 'approved', 6, '2026-03-28 07:49:40', '2026-03-28 14:49:40', '2026-03-28 14:49:40'),
(2, 12, 'test', 'test from student', 'urgent', 'all', NULL, 'approved', 1, '2026-03-30 09:27:57', '2026-03-30 09:27:31', '2026-03-30 09:27:57');

-- --------------------------------------------------------

--
-- Table structure for table `announcement_reads`
--

CREATE TABLE `announcement_reads` (
  `announcement_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `read_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `announcement_reads`
--

INSERT INTO `announcement_reads` (`announcement_id`, `user_id`, `read_at`) VALUES
(1, 5, '2026-03-30 09:30:48'),
(1, 6, '2026-03-28 14:49:40'),
(1, 10, '2026-03-30 09:28:40'),
(1, 11, '2026-03-28 14:49:48'),
(1, 12, '2026-03-30 09:27:01'),
(2, 5, '2026-03-30 09:30:44'),
(2, 10, '2026-03-30 09:28:39'),
(2, 12, '2026-04-06 12:25:45');

-- --------------------------------------------------------

--
-- Table structure for table `attachments`
--

CREATE TABLE `attachments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `uploader_id` int(10) UNSIGNED NOT NULL,
  `message_id` bigint(20) UNSIGNED DEFAULT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `file_hash` char(64) NOT NULL,
  `mime_type` varchar(150) NOT NULL,
  `file_size` bigint(20) UNSIGNED NOT NULL,
  `is_video` tinyint(1) NOT NULL DEFAULT 0,
  `is_voice` tinyint(1) NOT NULL DEFAULT 0,
  `last_accessed` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `conversations`
--

CREATE TABLE `conversations` (
  `id` int(10) UNSIGNED NOT NULL,
  `type` enum('direct','group') NOT NULL,
  `name` varchar(150) DEFAULT NULL,
  `is_request` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `conversations`
--

INSERT INTO `conversations` (`id`, `type`, `name`, `is_request`, `created_at`, `updated_at`) VALUES
(1, 'direct', NULL, 0, '2026-03-21 08:00:00', '2026-03-21 08:14:00'),
(2, 'direct', NULL, 0, '2026-03-21 08:55:00', '2026-03-21 09:05:00'),
(3, 'direct', NULL, 0, '2026-03-21 10:10:00', '2026-03-21 10:21:00'),
(4, 'group', 'BSCS 3A', 0, '2026-03-21 10:45:00', '2026-03-21 11:11:00'),
(5, 'group', 'Math 101 - Section B', 0, '2026-03-21 12:30:00', '2026-03-21 13:07:00'),
(6, 'group', 'Campus Research Team', 0, '2026-03-21 13:40:00', '2026-03-21 14:33:00'),
(7, 'group', 'Student Council Core', 0, '2026-03-21 14:30:00', '2026-03-21 15:11:00'),
(8, 'direct', NULL, 0, '2026-03-21 15:50:00', '2026-03-21 16:06:00'),
(9, 'direct', NULL, 0, '2026-03-21 16:20:00', '2026-03-21 16:34:00'),
(10, 'group', 'Admin and Faculty Ops', 0, '2026-03-21 16:50:00', '2026-03-21 17:12:00'),
(11, 'direct', NULL, 0, '2026-03-29 10:12:36', '2026-03-29 10:15:56'),
(13, 'direct', NULL, 0, '2026-03-30 00:21:56', '2026-03-30 00:22:50');

-- --------------------------------------------------------

--
-- Table structure for table `conversation_hidden`
--

CREATE TABLE `conversation_hidden` (
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `hidden_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `conversation_members`
--

CREATE TABLE `conversation_members` (
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `role` enum('admin','member') NOT NULL DEFAULT 'member',
  `joined_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `conversation_members`
--

INSERT INTO `conversation_members` (`conversation_id`, `user_id`, `role`, `joined_at`) VALUES
(1, 4, 'member', '2026-03-21 08:00:00'),
(1, 9, 'member', '2026-03-21 08:00:00'),
(2, 10, 'member', '2026-03-21 08:55:00'),
(2, 11, 'member', '2026-03-21 08:55:00'),
(3, 5, 'member', '2026-03-21 10:10:00'),
(3, 12, 'member', '2026-03-21 10:10:00'),
(4, 4, 'admin', '2026-03-21 10:45:00'),
(4, 9, 'member', '2026-03-21 10:45:00'),
(4, 10, 'member', '2026-03-21 10:45:00'),
(4, 11, 'member', '2026-03-21 10:45:00'),
(4, 12, 'member', '2026-03-21 10:45:00'),
(4, 13, 'member', '2026-03-21 10:45:00'),
(5, 5, 'admin', '2026-03-21 12:30:00'),
(5, 14, 'member', '2026-03-21 12:30:00'),
(5, 15, 'member', '2026-03-21 12:30:00'),
(5, 16, 'member', '2026-03-21 12:30:00'),
(5, 17, 'member', '2026-03-21 12:30:00'),
(6, 4, 'member', '2026-03-21 13:40:00'),
(6, 6, 'admin', '2026-03-21 13:40:00'),
(6, 21, 'member', '2026-03-21 13:40:00'),
(6, 22, 'member', '2026-03-21 13:40:00'),
(7, 2, 'admin', '2026-03-21 14:30:00'),
(7, 18, 'member', '2026-03-21 14:30:00'),
(7, 19, 'member', '2026-03-21 14:30:00'),
(7, 20, 'member', '2026-03-21 14:30:00'),
(7, 23, 'member', '2026-03-21 14:30:00'),
(7, 24, 'member', '2026-03-21 14:30:00'),
(7, 25, 'member', '2026-03-21 14:30:00'),
(8, 3, 'member', '2026-03-21 15:50:00'),
(8, 6, 'member', '2026-03-21 15:50:00'),
(9, 2, 'member', '2026-03-21 16:20:00'),
(9, 14, 'member', '2026-03-21 16:20:00'),
(10, 2, 'admin', '2026-03-21 16:50:00'),
(10, 3, 'admin', '2026-03-21 16:50:00'),
(10, 4, 'member', '2026-03-21 16:50:00'),
(10, 5, 'member', '2026-03-21 16:50:00'),
(10, 6, 'member', '2026-03-21 16:50:00'),
(10, 7, 'member', '2026-03-21 16:50:00'),
(10, 8, 'member', '2026-03-21 16:50:00'),
(11, 10, 'member', '2026-03-29 10:12:36'),
(11, 14, 'member', '2026-03-29 10:12:36'),
(13, 11, 'member', '2026-03-30 00:21:56'),
(13, 12, 'member', '2026-03-30 00:21:56');

-- --------------------------------------------------------

--
-- Table structure for table `conversation_read_status`
--

CREATE TABLE `conversation_read_status` (
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `last_read_at` datetime DEFAULT NULL,
  `last_read_msg_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `conversation_read_status`
--

INSERT INTO `conversation_read_status` (`conversation_id`, `user_id`, `last_read_at`, `last_read_msg_id`) VALUES
(2, 10, '2026-04-06 16:10:08', 85),
(2, 11, '2026-04-06 15:24:56', 85),
(3, 5, '2026-03-28 14:43:40', 50),
(3, 12, '2026-03-30 08:22:48', 50),
(4, 4, '2026-04-06 15:24:15', 86),
(4, 10, '2026-04-06 16:10:08', 86),
(4, 11, '2026-04-06 15:24:56', 86),
(4, 12, '2026-04-06 15:22:00', 86),
(5, 5, '2026-03-30 09:30:34', 58),
(5, 14, '2026-03-29 18:13:21', 58),
(6, 6, '2026-03-28 14:50:16', 28),
(7, 18, '2026-03-30 08:13:10', 73),
(7, 25, '2026-03-28 14:33:05', 47),
(8, 6, '2026-03-28 14:49:18', 36),
(9, 14, '2026-03-30 08:23:21', 80),
(10, 5, '2026-03-28 14:43:30', 46),
(10, 6, '2026-03-28 14:49:19', 46),
(11, 10, '2026-04-06 15:20:55', 81),
(11, 14, '2026-03-30 08:23:25', 81),
(13, 11, '2026-04-06 15:24:55', 82),
(13, 12, '2026-03-30 09:26:52', 82);

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `departments`
--

INSERT INTO `departments` (`id`, `name`, `created_at`) VALUES
(1, 'Business', '2026-03-20 07:00:00'),
(2, 'Computer Science', '2026-03-20 07:00:00'),
(3, 'Engineering', '2026-03-20 07:00:00'),
(4, 'Humanities', '2026-03-20 07:00:00'),
(5, 'Information Technology', '2026-03-20 07:00:00'),
(6, 'Mathematics', '2026-03-20 07:00:00'),
(7, 'Registrar', '2026-03-20 07:00:00');

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `sender_id` int(10) UNSIGNED NOT NULL,
  `body` text DEFAULT NULL,
  `attachment_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('sent','delivered','seen') NOT NULL DEFAULT 'sent',
  `is_edited` tinyint(1) NOT NULL DEFAULT 0,
  `edited_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `messages`
--

INSERT INTO `messages` (`id`, `conversation_id`, `sender_id`, `body`, `attachment_id`, `status`, `is_edited`, `edited_at`, `is_deleted`, `created_at`, `updated_at`) VALUES
(1, 1, 9, 'Good morning sir, can I confirm our consultation schedule?', NULL, 'seen', 0, NULL, 0, '2026-03-21 08:10:00', '2026-03-21 08:10:00'),
(2, 1, 4, 'Good morning Aaron. Yes, 1:30 PM in the CS lab.', NULL, 'seen', 0, NULL, 0, '2026-03-21 08:12:00', '2026-03-21 08:12:00'),
(3, 1, 9, 'Noted, thank you sir.', NULL, 'seen', 0, NULL, 0, '2026-03-21 08:13:00', '2026-03-21 08:13:00'),
(4, 1, 4, 'Bring your draft proposal so we can review chapter one.', NULL, 'seen', 0, NULL, 0, '2026-03-21 08:14:00', '2026-03-21 08:14:00'),
(5, 2, 10, 'Carlo, are you joining the library study group later?', NULL, 'seen', 0, NULL, 0, '2026-03-21 09:00:00', '2026-03-21 09:00:00'),
(6, 2, 11, 'Yes, I will be there after my 10 AM class.', NULL, 'seen', 0, NULL, 0, '2026-03-21 09:02:00', '2026-03-21 09:02:00'),
(7, 2, 10, 'Great, I will reserve a table near the reference section.', NULL, 'seen', 0, NULL, 0, '2026-03-21 09:03:00', '2026-03-21 09:03:00'),
(8, 2, 11, 'Nice, see you there.', NULL, 'seen', 0, NULL, 0, '2026-03-21 09:05:00', '2026-03-21 09:05:00'),
(9, 3, 12, 'Maam Santos, may I request a make-up quiz this Friday?', NULL, 'seen', 0, NULL, 0, '2026-03-21 10:15:00', '2026-03-21 10:15:00'),
(10, 3, 5, 'You may take it at 3 PM in Room M204.', NULL, 'seen', 0, NULL, 0, '2026-03-21 10:18:00', '2026-03-21 10:18:00'),
(11, 3, 12, 'Thank you maam, I will be there on time.', NULL, 'seen', 0, NULL, 0, '2026-03-21 10:19:00', '2026-03-21 10:19:00'),
(12, 3, 5, 'Please bring your ID and calculator.', NULL, 'seen', 0, NULL, 0, '2026-03-21 10:21:00', '2026-03-21 10:21:00'),
(13, 4, 4, 'Reminder: project checkpoint is due on Monday 5 PM.', NULL, 'seen', 0, NULL, 0, '2026-03-21 11:00:00', '2026-03-21 11:00:00'),
(14, 4, 10, 'Sir, can we submit as a team of four?', NULL, 'seen', 0, NULL, 0, '2026-03-21 11:04:00', '2026-03-21 11:04:00'),
(15, 4, 4, 'Yes, teams of three to four are allowed.', NULL, 'seen', 0, NULL, 0, '2026-03-21 11:06:00', '2026-03-21 11:06:00'),
(16, 4, 13, 'Can we use React for the frontend requirement?', NULL, 'seen', 0, NULL, 0, '2026-03-21 11:08:00', '2026-03-21 11:08:00'),
(17, 4, 4, 'React is allowed as long as your API is documented.', NULL, 'seen', 0, NULL, 0, '2026-03-21 11:10:00', '2026-03-21 11:10:00'),
(18, 4, 11, 'Noted sir, thank you.', NULL, 'seen', 0, NULL, 0, '2026-03-21 11:11:00', '2026-03-21 11:11:00'),
(19, 5, 5, 'Quiz coverage includes limits, derivatives, and optimization.', NULL, 'seen', 0, NULL, 0, '2026-03-21 13:00:00', '2026-03-21 13:00:00'),
(20, 5, 14, 'Will there be a formula sheet provided?', NULL, 'seen', 0, NULL, 0, '2026-03-21 13:02:00', '2026-03-21 13:02:00'),
(21, 5, 5, 'Yes, one page will be provided during the quiz.', NULL, 'seen', 1, '2026-03-21 13:05:00', 0, '2026-03-21 13:04:00', '2026-03-21 13:05:00'),
(22, 5, 16, 'Can we have a short review after class tomorrow?', NULL, 'seen', 0, NULL, 0, '2026-03-21 13:06:00', '2026-03-21 13:06:00'),
(23, 5, 5, 'Sure, I can stay for 20 minutes after class.', NULL, 'seen', 0, NULL, 0, '2026-03-21 13:07:00', '2026-03-21 13:07:00'),
(24, 6, 6, 'Team, submit your literature matrix by Wednesday noon.', NULL, 'seen', 0, NULL, 0, '2026-03-21 14:20:00', '2026-03-21 14:20:00'),
(25, 6, 21, 'I have uploaded my draft matrix to the shared drive.', NULL, 'seen', 0, NULL, 0, '2026-03-21 14:24:00', '2026-03-21 14:24:00'),
(26, 6, 22, 'I will submit mine tonight after lab.', NULL, 'seen', 0, NULL, 0, '2026-03-21 14:26:00', '2026-03-21 14:26:00'),
(27, 6, 4, 'Please follow IEEE citation format for all references.', NULL, 'seen', 0, NULL, 0, '2026-03-21 14:30:00', '2026-03-21 14:30:00'),
(28, 6, 6, 'Thank you. We will consolidate on Thursday morning.', NULL, 'seen', 0, NULL, 0, '2026-03-21 14:33:00', '2026-03-21 14:33:00'),
(29, 7, 2, 'Please finalize the agenda for next week\'s student forum.', NULL, 'seen', 0, NULL, 0, '2026-03-21 15:00:00', '2026-03-21 15:00:00'),
(30, 7, 18, 'Draft agenda is ready, sending for review tonight.', NULL, 'seen', 0, NULL, 0, '2026-03-21 15:05:00', '2026-03-21 15:05:00'),
(31, 7, 20, 'Can we include a transportation concern segment?', NULL, 'seen', 0, NULL, 0, '2026-03-21 15:07:00', '2026-03-21 15:07:00'),
(32, 7, 2, 'Yes, include it under campus services.', NULL, 'seen', 0, NULL, 0, '2026-03-21 15:10:00', '2026-03-21 15:10:00'),
(33, 7, 24, 'I can handle the opening remarks.', NULL, 'seen', 0, NULL, 0, '2026-03-21 15:11:00', '2026-03-21 15:11:00'),
(34, 8, 6, 'Can IT enable my account access to the new grading portal?', NULL, 'seen', 0, NULL, 0, '2026-03-21 16:00:00', '2026-03-21 16:00:00'),
(35, 8, 3, 'Enabled already. Please log out and sign in again.', NULL, 'seen', 0, NULL, 0, '2026-03-21 16:04:00', '2026-03-21 16:04:00'),
(36, 8, 6, 'Working now, thank you.', NULL, 'seen', 0, NULL, 0, '2026-03-21 16:06:00', '2026-03-21 16:06:00'),
(37, 9, 14, 'Sir, where can I submit my scholarship documents?', NULL, 'seen', 0, NULL, 0, '2026-03-21 16:30:00', '2026-03-21 16:30:00'),
(38, 9, 2, 'Submit to Registrar Window 2 before 4 PM tomorrow.', NULL, 'seen', 0, NULL, 0, '2026-03-21 16:33:00', '2026-03-21 16:33:00'),
(39, 9, 14, 'Thank you for the clarification.', NULL, 'seen', 0, NULL, 0, '2026-03-21 16:34:00', '2026-03-21 16:34:00'),
(40, 10, 3, 'System maintenance is scheduled on Saturday 8 PM to 10 PM.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:00:00', '2026-03-21 17:00:00'),
(41, 10, 2, 'Please notify all departments before Friday noon.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:03:00', '2026-03-21 17:03:00'),
(42, 10, 7, 'Business department advisory draft is ready.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:05:00', '2026-03-21 17:05:00'),
(43, 10, 8, 'Humanities will post the notice on our board today.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:06:00', '2026-03-21 17:06:00'),
(44, 10, 4, 'CS department already informed.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:08:00', '2026-03-21 17:08:00'),
(45, 10, 5, 'Math department confirmed receipt.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:10:00', '2026-03-28 14:49:16'),
(46, 10, 6, 'Engineering students have been notified as well.', NULL, 'delivered', 0, NULL, 0, '2026-03-21 17:12:00', '2026-03-28 14:43:30'),
(47, 7, 25, 'hi', NULL, 'delivered', 0, NULL, 0, '2026-03-28 14:32:55', '2026-03-28 14:33:35'),
(48, 7, 18, 'hello', NULL, 'sent', 0, NULL, 0, '2026-03-28 14:33:40', '2026-03-28 14:33:40'),
(49, 4, 11, 'Hi everyone!', NULL, 'delivered', 0, NULL, 0, '2026-03-28 14:42:49', '2026-03-28 14:43:08'),
(50, 3, 5, 'Please bring...', NULL, 'seen', 0, NULL, 0, '2026-03-28 14:43:38', '2026-03-29 18:28:17'),
(51, 2, 10, 'hello', NULL, 'seen', 0, NULL, 0, '2026-03-28 14:47:01', '2026-03-28 14:47:12'),
(52, 2, 11, 'hello', NULL, 'seen', 0, NULL, 0, '2026-03-28 14:47:30', '2026-03-28 14:47:30'),
(53, 9, 14, 'hi', NULL, 'sent', 0, NULL, 0, '2026-03-29 18:07:24', '2026-03-29 18:07:24'),
(54, 9, 14, 'tet', NULL, 'sent', 0, NULL, 0, '2026-03-29 18:07:31', '2026-03-29 18:07:31'),
(55, 5, 14, 'hello', NULL, 'delivered', 0, NULL, 0, '2026-03-29 18:12:18', '2026-03-30 09:30:34'),
(56, 11, 14, 'hii!', NULL, 'seen', 0, NULL, 0, '2026-03-29 18:12:36', '2026-03-29 18:15:57'),
(58, 5, 14, 'hello', NULL, 'delivered', 0, NULL, 0, '2026-03-29 18:13:21', '2026-03-30 09:30:34'),
(59, 9, 14, 'test', NULL, 'sent', 0, NULL, 0, '2026-03-29 18:13:22', '2026-03-29 18:13:22'),
(60, 9, 14, 'asdfads', NULL, 'sent', 0, NULL, 0, '2026-03-29 18:14:04', '2026-03-29 18:14:04'),
(61, 11, 10, 'uii hello', NULL, 'seen', 0, NULL, 0, '2026-03-29 18:16:06', '2026-03-30 07:58:46'),
(62, 11, 10, 'oo kamusta naka', NULL, 'seen', 0, NULL, 0, '2026-03-29 18:16:13', '2026-03-30 07:58:46'),
(63, 11, 10, 'this is eavesdropping test', NULL, 'seen', 0, NULL, 0, '2026-03-29 18:16:36', '2026-03-30 07:58:46'),
(64, 11, 10, 'test123', NULL, 'seen', 0, NULL, 0, '2026-03-29 18:23:50', '2026-03-30 07:58:46'),
(65, 11, 10, 'oh shet', NULL, 'seen', 0, NULL, 0, '2026-03-29 18:27:39', '2026-03-30 07:58:46'),
(66, 9, 14, 'I am faith', NULL, 'sent', 0, NULL, 0, '2026-03-30 08:00:20', '2026-03-30 08:00:20'),
(67, 2, 11, 'hi martinez', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:00:39', '2026-03-30 08:10:28'),
(68, 2, 11, 'this is test', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:08:11', '2026-03-30 08:10:28'),
(69, 2, 11, 'this is test', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:08:46', '2026-03-30 08:10:28'),
(70, 2, 10, 'hello', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:10:30', '2026-03-30 08:15:31'),
(71, 2, 10, 'test', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:12:21', '2026-03-30 08:15:31'),
(72, 7, 18, 'hi!', NULL, 'sent', 0, NULL, 0, '2026-03-30 08:12:59', '2026-03-30 08:12:59'),
(73, 7, 18, 'testing phase 123', NULL, 'sent', 0, NULL, 0, '2026-03-30 08:13:10', '2026-03-30 08:13:10'),
(74, 2, 11, 'testing 123', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:15:40', '2026-03-30 08:24:02'),
(75, 2, 11, 'testin123', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:15:43', '2026-03-30 08:24:02'),
(76, 2, 11, '1234', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:15:44', '2026-03-30 08:24:02'),
(77, 2, 11, 'test123', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:21:34', '2026-03-30 08:24:02'),
(78, 13, 11, 'edited123', NULL, 'seen', 1, '2026-03-30 08:22:27', 0, '2026-03-30 08:21:56', '2026-03-30 08:22:50'),
(79, 13, 12, 'hello', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:22:59', '2026-03-30 08:23:43'),
(80, 9, 14, 'hello123', NULL, 'sent', 0, NULL, 0, '2026-03-30 08:23:21', '2026-03-30 08:23:21'),
(81, 11, 14, 'test123', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:23:25', '2026-03-30 08:24:01'),
(82, 13, 11, 'test123', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:23:44', '2026-03-30 09:26:52'),
(83, 2, 10, 'testing123', NULL, 'seen', 0, NULL, 0, '2026-03-30 08:24:04', '2026-04-06 15:24:53'),
(84, 2, 10, 'this is test', NULL, 'seen', 0, NULL, 0, '2026-03-30 09:03:15', '2026-04-06 15:24:53'),
(85, 2, 10, '123', NULL, 'seen', 0, NULL, 0, '2026-03-30 09:03:17', '2026-04-06 15:24:53'),
(86, 4, 10, 'Hi! Everyone!', NULL, 'delivered', 0, NULL, 0, '2026-04-06 15:21:04', '2026-04-06 15:22:00');

-- --------------------------------------------------------

--
-- Table structure for table `message_attachments`
--

CREATE TABLE `message_attachments` (
  `message_id` bigint(20) UNSIGNED NOT NULL,
  `attachment_id` bigint(20) UNSIGNED NOT NULL,
  `sort_order` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message_flags`
--

CREATE TABLE `message_flags` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `message_id` bigint(20) UNSIGNED NOT NULL,
  `flagged_by` int(10) UNSIGNED NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message_hidden`
--

CREATE TABLE `message_hidden` (
  `message_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `hidden_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message_reactions`
--

CREATE TABLE `message_reactions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `message_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `emoji` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message_reads`
--

CREATE TABLE `message_reads` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `message_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `read_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `message_reads`
--

INSERT INTO `message_reads` (`id`, `message_id`, `user_id`, `read_at`) VALUES
(1, 29, 25, '2026-03-28 14:30:33'),
(2, 30, 25, '2026-03-28 14:30:33'),
(3, 31, 25, '2026-03-28 14:30:33'),
(4, 32, 25, '2026-03-28 14:30:33'),
(5, 33, 25, '2026-03-28 14:30:33'),
(6, 29, 18, '2026-03-28 14:33:35'),
(7, 31, 18, '2026-03-28 14:33:35'),
(8, 32, 18, '2026-03-28 14:33:35'),
(9, 33, 18, '2026-03-28 14:33:35'),
(10, 47, 18, '2026-03-28 14:33:35'),
(11, 5, 11, '2026-03-28 14:42:41'),
(12, 7, 11, '2026-03-28 14:42:41'),
(13, 13, 11, '2026-03-28 14:42:42'),
(14, 14, 11, '2026-03-28 14:42:42'),
(15, 15, 11, '2026-03-28 14:42:42'),
(16, 16, 11, '2026-03-28 14:42:42'),
(17, 17, 11, '2026-03-28 14:42:42'),
(23, 13, 12, '2026-03-28 14:43:08'),
(24, 14, 12, '2026-03-28 14:43:08'),
(25, 15, 12, '2026-03-28 14:43:08'),
(26, 16, 12, '2026-03-28 14:43:08'),
(27, 17, 12, '2026-03-28 14:43:08'),
(28, 18, 12, '2026-03-28 14:43:08'),
(29, 49, 12, '2026-03-28 14:43:08'),
(30, 10, 12, '2026-03-28 14:43:10'),
(31, 12, 12, '2026-03-28 14:43:10'),
(32, 40, 5, '2026-03-28 14:43:30'),
(33, 41, 5, '2026-03-28 14:43:30'),
(34, 42, 5, '2026-03-28 14:43:30'),
(35, 43, 5, '2026-03-28 14:43:30'),
(36, 44, 5, '2026-03-28 14:43:30'),
(37, 46, 5, '2026-03-28 14:43:30'),
(38, 20, 5, '2026-03-28 14:43:31'),
(39, 22, 5, '2026-03-28 14:43:31'),
(42, 9, 5, '2026-03-28 14:43:31'),
(43, 11, 5, '2026-03-28 14:43:31'),
(44, 13, 10, '2026-03-28 14:46:05'),
(45, 15, 10, '2026-03-28 14:46:05'),
(46, 16, 10, '2026-03-28 14:46:05'),
(47, 17, 10, '2026-03-28 14:46:05'),
(48, 18, 10, '2026-03-28 14:46:05'),
(49, 49, 10, '2026-03-28 14:46:05'),
(50, 6, 10, '2026-03-28 14:46:05'),
(51, 8, 10, '2026-03-28 14:46:05'),
(52, 51, 11, '2026-03-28 14:47:12'),
(53, 52, 10, '2026-03-28 14:47:30'),
(54, 40, 6, '2026-03-28 14:49:16'),
(55, 41, 6, '2026-03-28 14:49:16'),
(56, 42, 6, '2026-03-28 14:49:16'),
(57, 43, 6, '2026-03-28 14:49:16'),
(58, 44, 6, '2026-03-28 14:49:16'),
(59, 45, 6, '2026-03-28 14:49:16'),
(60, 35, 6, '2026-03-28 14:49:17'),
(61, 25, 6, '2026-03-28 14:49:17'),
(62, 26, 6, '2026-03-28 14:49:17'),
(63, 27, 6, '2026-03-28 14:49:17'),
(64, 38, 14, '2026-03-29 18:07:23'),
(65, 19, 14, '2026-03-29 18:12:11'),
(66, 21, 14, '2026-03-29 18:12:11'),
(67, 22, 14, '2026-03-29 18:12:11'),
(68, 23, 14, '2026-03-29 18:12:11'),
(69, 56, 10, '2026-03-29 18:15:57'),
(70, 50, 12, '2026-03-29 18:28:17'),
(71, 61, 14, '2026-03-30 07:58:46'),
(72, 62, 14, '2026-03-30 07:58:46'),
(73, 63, 14, '2026-03-30 07:58:46'),
(74, 64, 14, '2026-03-30 07:58:46'),
(75, 65, 14, '2026-03-30 07:58:46'),
(76, 67, 10, '2026-03-30 08:10:28'),
(77, 68, 10, '2026-03-30 08:10:28'),
(78, 69, 10, '2026-03-30 08:10:28'),
(79, 70, 11, '2026-03-30 08:15:31'),
(80, 71, 11, '2026-03-30 08:15:31'),
(81, 78, 12, '2026-03-30 08:22:50'),
(82, 79, 11, '2026-03-30 08:23:42'),
(83, 81, 10, '2026-03-30 08:24:01'),
(84, 74, 10, '2026-03-30 08:24:02'),
(85, 75, 10, '2026-03-30 08:24:02'),
(86, 76, 10, '2026-03-30 08:24:02'),
(87, 77, 10, '2026-03-30 08:24:02'),
(88, 82, 12, '2026-03-30 09:26:52'),
(89, 55, 5, '2026-03-30 09:30:34'),
(90, 58, 5, '2026-03-30 09:30:34'),
(91, 86, 12, '2026-04-06 15:22:00'),
(92, 86, 11, '2026-04-06 15:23:08'),
(93, 14, 4, '2026-04-06 15:24:15'),
(94, 16, 4, '2026-04-06 15:24:15'),
(95, 18, 4, '2026-04-06 15:24:15'),
(96, 49, 4, '2026-04-06 15:24:15'),
(97, 86, 4, '2026-04-06 15:24:15'),
(98, 83, 11, '2026-04-06 15:24:53'),
(99, 84, 11, '2026-04-06 15:24:53'),
(100, 85, 11, '2026-04-06 15:24:53');

-- --------------------------------------------------------

--
-- Table structure for table `message_requests`
--

CREATE TABLE `message_requests` (
  `id` int(10) UNSIGNED NOT NULL,
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `requester_id` int(10) UNSIGNED NOT NULL,
  `recipient_id` int(10) UNSIGNED NOT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `message_requests`
--

INSERT INTO `message_requests` (`id`, `conversation_id`, `requester_id`, `recipient_id`, `status`, `created_at`, `updated_at`) VALUES
(1, 11, 14, 10, 'accepted', '2026-03-29 18:12:36', '2026-03-29 18:15:56');

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_requests`
--

CREATE TABLE `password_reset_requests` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `status` enum('pending','completed','rejected') NOT NULL DEFAULT 'pending',
  `reset_method` enum('admin','self_service') NOT NULL DEFAULT 'admin',
  `reset_token` varchar(64) DEFAULT NULL,
  `token_expires_at` datetime DEFAULT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `temp_plain` varchar(32) DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `password_reset_requests`
--

INSERT INTO `password_reset_requests` (`id`, `user_id`, `status`, `reset_method`, `reset_token`, `token_expires_at`, `attempts`, `temp_plain`, `requested_at`, `resolved_at`) VALUES
(7, 10, 'rejected', 'self_service', '8cc2f118239009fdbe44930ab5792b4356369d9c0eb350e5ee4f4344236de929', '2026-04-06 14:05:48', 0, NULL, '2026-04-06 19:50:48', '2026-04-06 19:51:21'),
(8, 10, 'rejected', 'self_service', '8fcf8ad49f5c3ef4f282bc9e1537352b6807c02d542bd771da48dfd780dbba06', '2026-04-06 14:06:21', 0, NULL, '2026-04-06 19:51:21', '2026-04-06 19:51:59'),
(9, 10, 'rejected', 'self_service', 'bb17bfb64c7b3332cbbc1ceb6c5ad7d66ca596d9b64ce49915c9aca7442bb8d4', '2026-04-06 14:06:59', 0, NULL, '2026-04-06 19:51:59', '2026-04-06 19:52:33'),
(10, 10, 'rejected', 'self_service', '49e5a97aa89f7f240607a5474e73b24f9772020ed99a8b92fc24f1472b9a4a81', '2026-04-06 14:07:33', 0, NULL, '2026-04-06 19:52:33', '2026-04-06 19:53:11'),
(11, 10, 'rejected', 'self_service', '1b68458c6a6ed03f028191901f5c7e5ebcbab503bbebe694e95554c62257a6a7', '2026-04-06 14:08:11', 0, NULL, '2026-04-06 19:53:11', '2026-04-06 20:02:33'),
(12, 10, 'pending', 'self_service', '91d780ae38e190957af75d77470a93a3a4d3efb96e654eff973335ca0a08f14f', '2026-04-06 14:17:33', 0, NULL, '2026-04-06 20:02:33', NULL),
(13, 10, 'pending', 'admin', NULL, NULL, 0, NULL, '2026-04-06 20:14:06', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `username` varchar(100) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `contact_number` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `status` enum('pending','active','disabled') NOT NULL DEFAULT 'pending',
  `role` enum('student','faculty','admin','super_admin') NOT NULL DEFAULT 'student',
  `department` int(10) UNSIGNED DEFAULT NULL,
  `force_password_change` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `full_name`, `contact_number`, `password_hash`, `status`, `role`, `department`, `force_password_change`, `created_at`, `updated_at`) VALUES
(1, 'username', 'Administrator', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'super_admin', NULL, 0, '2026-03-27 08:01:03', '2026-03-27 08:01:03'),
(2, 'admin_registrar', 'Marissa Dela Cruz', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'admin', 7, 0, '2026-03-20 07:30:00', '2026-03-20 07:30:00'),
(3, 'admin_it', 'Noel R. Santos', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'admin', 5, 0, '2026-03-20 07:35:00', '2026-03-20 07:35:00'),
(4, 'faculty_mreyes', 'Mark Reyes', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'faculty', 2, 0, '2026-03-20 08:00:00', '2026-03-20 08:00:00'),
(5, 'faculty_lsantos', 'Liza Santos', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'faculty', 6, 0, '2026-03-20 08:03:00', '2026-03-20 08:03:00'),
(6, 'faculty_jdela', 'John Dela Pena', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'faculty', 3, 0, '2026-03-20 08:05:00', '2026-03-20 08:05:00'),
(7, 'faculty_apatel', 'Aisha Patel', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'faculty', 1, 0, '2026-03-20 08:06:00', '2026-03-20 08:06:00'),
(8, 'faculty_cgomez', 'Carlos Gomez', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'faculty', 4, 0, '2026-03-20 08:08:00', '2026-03-20 08:08:00'),
(9, 'stud_aaron', 'Aaron Lim', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 2, 0, '2026-03-20 08:20:00', '2026-04-06 07:09:12'),
(10, 'stud_bea', 'Bea Martinez', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 2, 0, '2026-03-20 08:22:00', '2026-04-06 07:09:14'),
(11, 'stud_carlo', 'Carlo Villanueva', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 2, 0, '2026-03-20 08:24:00', '2026-03-20 08:24:00'),
(12, 'stud_diana', 'Diana Uy', NULL, '$2y$10$k1xJUjopPA0TnW4TMF1d7et6ZsbfJcbTfr1/kJJNTVDRyeW45eiPS', 'active', 'student', 6, 0, '2026-03-20 08:26:00', '2026-04-06 05:22:03'),
(13, 'stud_elijah', 'Elijah Navarro', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 2, 0, '2026-03-20 08:28:00', '2026-03-20 08:28:00'),
(14, 'stud_faith', 'Faith Ramos', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 6, 0, '2026-03-20 08:30:00', '2026-03-20 08:30:00'),
(15, 'stud_gino', 'Gino Torres', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 6, 0, '2026-03-20 08:32:00', '2026-03-20 08:32:00'),
(16, 'stud_hanna', 'Hanna Cruz', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 6, 0, '2026-03-20 08:34:00', '2026-03-20 08:34:00'),
(17, 'stud_ivan', 'Ivan Yao', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 6, 0, '2026-03-20 08:36:00', '2026-03-20 08:36:00'),
(18, 'stud_jessa', 'Jessa Aquino', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 1, 0, '2026-03-20 08:38:00', '2026-03-20 08:38:00'),
(19, 'stud_kevin', 'Kevin Alvarez', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 1, 0, '2026-03-20 08:40:00', '2026-03-20 08:40:00'),
(20, 'stud_lara', 'Lara Flores', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 1, 0, '2026-03-20 08:42:00', '2026-03-20 08:42:00'),
(21, 'stud_miguel', 'Miguel dela Rosa', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 3, 0, '2026-03-20 08:44:00', '2026-03-20 08:44:00'),
(22, 'stud_nina', 'Nina Lopez', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 3, 0, '2026-03-20 08:46:00', '2026-03-20 08:46:00'),
(23, 'stud_omar', 'Omar Sy', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 4, 0, '2026-03-20 08:48:00', '2026-03-20 08:48:00'),
(24, 'stud_paula', 'Paula Mendoza', NULL, '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 4, 0, '2026-03-20 08:50:00', '2026-03-20 08:50:00'),
(25, 'stud_quentin', 'Quentin Tan', '09927956964', '$2y$10$ZOMTRWcOPMVJl1u3kaLf8O.fyUjIBirmscrab.b13XJc4qe/huzeC', 'active', 'student', 4, 0, '2026-03-20 08:52:00', '2026-03-30 01:23:50');

-- --------------------------------------------------------

--
-- Table structure for table `user_security_questions`
--

CREATE TABLE `user_security_questions` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `q1_index` tinyint(3) UNSIGNED NOT NULL,
  `q1_answer_hash` varchar(255) NOT NULL,
  `q2_index` tinyint(3) UNSIGNED NOT NULL,
  `q2_answer_hash` varchar(255) NOT NULL,
  `q3_index` tinyint(3) UNSIGNED NOT NULL,
  `q3_answer_hash` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_security_questions`
--

INSERT INTO `user_security_questions` (`id`, `user_id`, `q1_index`, `q1_answer_hash`, `q2_index`, `q2_answer_hash`, `q3_index`, `q3_answer_hash`, `created_at`, `updated_at`) VALUES
(1, 1, 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(2, 2, 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(3, 3, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(4, 4, 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(5, 5, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(6, 6, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(7, 7, 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(8, 8, 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(9, 9, 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(10, 10, 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(11, 11, 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(12, 12, 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(13, 13, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(14, 14, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(15, 15, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(16, 16, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(17, 17, 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(18, 18, 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(19, 19, 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(20, 20, 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(21, 21, 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(22, 22, 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(23, 23, 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 4, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 5, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(24, 24, 1, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00'),
(25, 25, 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 2, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', 3, '$2y$10$/L1J0xRF5.DtggUAs4LnGOYOHCYMqqMSpRl./h4xS3xIfgaR7.7b6', '2026-04-06 15:06:00', '2026-04-06 15:06:00');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `announcements`
--
ALTER TABLE `announcements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ann_author` (`author_id`),
  ADD KEY `idx_ann_status` (`status`),
  ADD KEY `idx_ann_target` (`target_type`,`department`),
  ADD KEY `idx_ann_created` (`created_at`),
  ADD KEY `fk_ann_approver` (`approved_by`);

--
-- Indexes for table `announcement_reads`
--
ALTER TABLE `announcement_reads`
  ADD PRIMARY KEY (`announcement_id`,`user_id`),
  ADD KEY `idx_ar_user` (`user_id`);

--
-- Indexes for table `attachments`
--
ALTER TABLE `attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_attachments_conversation` (`conversation_id`),
  ADD KEY `idx_attachments_uploader` (`uploader_id`),
  ADD KEY `idx_attachments_message` (`message_id`),
  ADD KEY `idx_attachments_hash` (`file_hash`),
  ADD KEY `idx_attachments_stored_name` (`stored_name`),
  ADD KEY `idx_attachments_last_accessed` (`last_accessed`);

--
-- Indexes for table `conversations`
--
ALTER TABLE `conversations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_conversations_type` (`type`),
  ADD KEY `idx_conversations_is_request` (`is_request`);

--
-- Indexes for table `conversation_hidden`
--
ALTER TABLE `conversation_hidden`
  ADD PRIMARY KEY (`conversation_id`,`user_id`),
  ADD KEY `idx_ch_user` (`user_id`);

--
-- Indexes for table `conversation_members`
--
ALTER TABLE `conversation_members`
  ADD PRIMARY KEY (`conversation_id`,`user_id`),
  ADD KEY `idx_cm_user` (`user_id`),
  ADD KEY `idx_cm_role` (`role`);

--
-- Indexes for table `conversation_read_status`
--
ALTER TABLE `conversation_read_status`
  ADD PRIMARY KEY (`conversation_id`,`user_id`),
  ADD KEY `idx_crs_user` (`user_id`),
  ADD KEY `idx_crs_last_read_msg` (`last_read_msg_id`);

--
-- Indexes for table `departments`
--
ALTER TABLE `departments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_dept_name` (`name`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_messages_conversation_created` (`conversation_id`,`created_at`),
  ADD KEY `idx_messages_sender` (`sender_id`),
  ADD KEY `idx_messages_status` (`status`),
  ADD KEY `idx_messages_attachment_id` (`attachment_id`);

--
-- Indexes for table `message_attachments`
--
ALTER TABLE `message_attachments`
  ADD PRIMARY KEY (`message_id`,`attachment_id`),
  ADD KEY `idx_message_attachments_sort` (`message_id`,`sort_order`),
  ADD KEY `fk_ma_attachment` (`attachment_id`);

--
-- Indexes for table `message_flags`
--
ALTER TABLE `message_flags`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_message_flags_message_user` (`message_id`,`flagged_by`),
  ADD KEY `idx_message_flags_message` (`message_id`),
  ADD KEY `idx_message_flags_flagged_by` (`flagged_by`);

--
-- Indexes for table `message_hidden`
--
ALTER TABLE `message_hidden`
  ADD PRIMARY KEY (`message_id`,`user_id`),
  ADD KEY `idx_message_hidden_user` (`user_id`);

--
-- Indexes for table `message_reactions`
--
ALTER TABLE `message_reactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_message_reaction` (`message_id`,`user_id`,`emoji`),
  ADD KEY `idx_message_reactions_message` (`message_id`),
  ADD KEY `idx_message_reactions_user` (`user_id`);

--
-- Indexes for table `message_reads`
--
ALTER TABLE `message_reads`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_message_reads_message_user` (`message_id`,`user_id`),
  ADD KEY `idx_message_reads_user` (`user_id`);

--
-- Indexes for table `message_requests`
--
ALTER TABLE `message_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_message_requests_conversation` (`conversation_id`),
  ADD KEY `idx_message_requests_pair` (`requester_id`,`recipient_id`),
  ADD KEY `idx_message_requests_recipient_status` (`recipient_id`,`status`);

--
-- Indexes for table `password_reset_requests`
--
ALTER TABLE `password_reset_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_prr_user_status` (`user_id`,`status`),
  ADD KEY `idx_prr_status_requested` (`status`,`requested_at`),
  ADD KEY `idx_prr_token` (`reset_token`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_users_username` (`username`),
  ADD KEY `idx_users_status` (`status`),
  ADD KEY `idx_users_role` (`role`),
  ADD KEY `idx_users_department` (`department`);

--
-- Indexes for table `user_security_questions`
--
ALTER TABLE `user_security_questions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `announcements`
--
ALTER TABLE `announcements`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `attachments`
--
ALTER TABLE `attachments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `conversations`
--
ALTER TABLE `conversations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `departments`
--
ALTER TABLE `departments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=87;

--
-- AUTO_INCREMENT for table `message_flags`
--
ALTER TABLE `message_flags`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `message_reactions`
--
ALTER TABLE `message_reactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `message_reads`
--
ALTER TABLE `message_reads`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=101;

--
-- AUTO_INCREMENT for table `message_requests`
--
ALTER TABLE `message_requests`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `password_reset_requests`
--
ALTER TABLE `password_reset_requests`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=26;

--
-- AUTO_INCREMENT for table `user_security_questions`
--
ALTER TABLE `user_security_questions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=26;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `announcements`
--
ALTER TABLE `announcements`
  ADD CONSTRAINT `fk_ann_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ann_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `announcement_reads`
--
ALTER TABLE `announcement_reads`
  ADD CONSTRAINT `fk_ar_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ar_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `attachments`
--
ALTER TABLE `attachments`
  ADD CONSTRAINT `fk_attachments_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_attachments_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_attachments_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `conversation_hidden`
--
ALTER TABLE `conversation_hidden`
  ADD CONSTRAINT `fk_ch_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ch_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `conversation_members`
--
ALTER TABLE `conversation_members`
  ADD CONSTRAINT `fk_cm_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `conversation_read_status`
--
ALTER TABLE `conversation_read_status`
  ADD CONSTRAINT `fk_crs_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_crs_last_message` FOREIGN KEY (`last_read_msg_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_crs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `message_attachments`
--
ALTER TABLE `message_attachments`
  ADD CONSTRAINT `fk_ma_attachment` FOREIGN KEY (`attachment_id`) REFERENCES `attachments` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ma_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `message_flags`
--
ALTER TABLE `message_flags`
  ADD CONSTRAINT `fk_message_flags_flagged_by` FOREIGN KEY (`flagged_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_flags_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `message_hidden`
--
ALTER TABLE `message_hidden`
  ADD CONSTRAINT `fk_message_hidden_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_hidden_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `message_reactions`
--
ALTER TABLE `message_reactions`
  ADD CONSTRAINT `fk_message_reactions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_reactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `message_reads`
--
ALTER TABLE `message_reads`
  ADD CONSTRAINT `fk_message_reads_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `message_requests`
--
ALTER TABLE `message_requests`
  ADD CONSTRAINT `fk_message_requests_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_requests_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_requests_requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `password_reset_requests`
--
ALTER TABLE `password_reset_requests`
  ADD CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_department` FOREIGN KEY (`department`) REFERENCES `departments` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `user_security_questions`
--
ALTER TABLE `user_security_questions`
  ADD CONSTRAINT `user_security_questions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
