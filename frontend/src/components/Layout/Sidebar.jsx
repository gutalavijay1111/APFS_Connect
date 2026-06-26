import React, { useState } from "react";
import { NavLink } from "react-router-dom";

const Sidebar = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const menu = [
    { label: "Dashboard", path: "/", icon: "🏠" },
    { label: "Promotions", path: "/promotions", icon: "📣" },
    { label: "Reminders", path: "/remainders", icon: "⏰" },
    { label: "Campaigns", path: "/campaigns", icon: "📊" },
    { label: "Flows", path: "/flows", icon: "📜" },
    { label: "Flow Builder", path: "/flow_builder", icon: "🧰" },
    { label: "Simulator", path: "/simulator", icon: "📱" },
  ];

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <>
      {/* Hamburger Menu */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 -left-4 opacity-80 hover:px-4 hover:left-2 z-50 lg:hidden p-2 rounded-md bg-gray-100 hover:bg-gray-200 hover:opacity-100 focus:outline-none shadow-lg transition-all"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h16m-7 6h7"
          />
        </svg>
      </button>

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 z-40 h-screen bg-white shadow-lg transform transition-transform duration-300 border-e-2 border-gray-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:shadow-none lg:w-48`}
      >
        {/* Header */}
        <div className="px-4 py-6">
          {/* Logo */}
          <div className="grid place-content-center">
            <img
              src="L2W_logo.png"
              alt="Logo"
              className="hidden lg:block h-auto w-auto rounded-lg"
            />
            <img
              src="logo_mini.png"
              alt="Mini Logo"
              className="lg:hidden h-10 w-auto rounded-lg"
            />
          </div>

          {/* Navigation */}
          <ul className="mt-6 flex sm:items-center lg:items-start flex-col space-y-2">
            {menu.map((item, index) => (
              <li key={index} className="group">
                <NavLink
                  to={item.path}
                  title={item.label} // Native tooltip
                  className={({ isActive }) =>
                    `flex items-center gap-4 rounded-lg px-4 py-2 text-sm font-medium ${
                      isActive
                        ? "text-gray-700 bg-gray-100"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    }`
                  }
                  onClick={closeSidebar} // Close sidebar when a menu item is clicked
                >
                  {/* Icon */}
                  <span className="text-lg">{item.icon}</span>

                  {/* Label */}
                  <span className="hidden lg:block">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-4 py-6">
          <p className="text-sm text-center text-gray-500 hidden lg:block">
            Made with ❤️ by VJ
          </p>
          <p className="text-sm text-center text-gray-500 lg:hidden">VJ</p>
        </div>
      </div>

      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={closeSidebar} // Close sidebar when clicking outside
        ></div>
      )}
    </>
  );
};

export default Sidebar;
