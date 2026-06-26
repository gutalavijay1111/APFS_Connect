import curses

ROWS = 8
COLS = 12
ROW_LABELS = "ABCDEFGH"

notify_text = ""
# Seats that are already booked (example)
BOOKED_SEATS = {"B3", "B4", "D7", "D8", "F1", "F2"}


def draw_layout(stdscr, selected: set, num_seats: int):
    stdscr.clear()
    height, width = stdscr.getmaxyx()

    curses.start_color()
    curses.init_pair(1, curses.COLOR_WHITE, curses.COLOR_BLACK)
    curses.init_pair(2, curses.COLOR_BLACK, curses.COLOR_GREEN)
    curses.init_pair(3, curses.COLOR_BLACK, curses.COLOR_RED)
    curses.init_pair(4, curses.COLOR_BLACK, curses.COLOR_WHITE)
    curses.init_pair(5, curses.COLOR_YELLOW, curses.COLOR_BLACK)

    def safe_addstr(y, x, text, attr=curses.A_NORMAL):
        # Skip rows at or past last line to avoid scroll-crash on the final cell
        if y < 0 or y >= height - 1:
            return
        if x < 0 or x >= width:
            return
        text = text[:max(0, width - x)]
        try:
            stdscr.addstr(y, x, text, attr)
        except curses.error:
            pass

    seat_width = 4
    gap = 2
    aisle_col = 6

    total_width = COLS * (seat_width + gap) + gap + len(ROW_LABELS) + 3
    start_x = max(0, (width - total_width) // 2)
    start_y = 2

    title = "CINEMA SEAT BOOKING"
    safe_addstr(start_y, max(0, (width - len(title)) // 2), title,
                curses.color_pair(5) | curses.A_BOLD)

    screen_label = "[ SCREEN ]"
    safe_addstr(start_y + 2, max(0, (width - len(screen_label)) // 2),
                screen_label, curses.color_pair(5))
    
    header_y = start_y + 4
    global notify_text
    safe_addstr(start_y + 2, max(0, (width - len(notify_text)) // 2),
                notify_text, curses.color_pair(5))

    header_y = start_y + 4
    x = start_x + 3
    for col in range(COLS):
        if col == aisle_col:
            x += gap
        safe_addstr(header_y, x, f"{col + 1:^{seat_width}}", curses.color_pair(1))
        x += seat_width + gap

    for row_idx, row_label in enumerate(ROW_LABELS):
        y = header_y + 2 + row_idx * 2
        safe_addstr(y, start_x, f"{row_label} ", curses.color_pair(1))
        x = start_x + 3
        for col in range(COLS):
            if col == aisle_col:
                x += gap
            seat_id = f"{row_label}{col + 1}"
            seat_text = f"[{seat_id:^{seat_width - 2}}]"
            if seat_id in BOOKED_SEATS:
                attr = curses.color_pair(3)
            elif seat_id in selected:
                attr = curses.color_pair(2) | curses.A_BOLD
            else:
                attr = curses.color_pair(4)
            safe_addstr(y, x, seat_text, attr)
            x += seat_width + gap

    legend_y = header_y + 2 + ROWS * 2 + 1
    safe_addstr(legend_y, start_x,      "  [  ] Available  ", curses.color_pair(4))
    safe_addstr(legend_y, start_x + 18, "  [  ] Selected  ",  curses.color_pair(2))
    safe_addstr(legend_y, start_x + 36, "  [  ] Booked  ",    curses.color_pair(3))

    status_y = legend_y + 2
    status = (f"Selected: {len(selected)}/{num_seats}  "
              f"Seats: {', '.join(sorted(selected)) or 'none'}")
    safe_addstr(status_y, start_x, status, curses.color_pair(5))

    if len(selected) == num_seats:
        confirm = "  Press ENTER to confirm, Q to quit  "
    else:
        remaining = num_seats - len(selected)
        confirm = f"  Click to select {remaining} more seat(s). Q to quit  "
    safe_addstr(status_y + 1, start_x, confirm, curses.color_pair(1))

    stdscr.refresh()
    return start_x, header_y, aisle_col, seat_width, gap


def hit_test(my, mx, start_x, header_y, aisle_col, seat_width, gap):
    """Return seat_id string if (mx, my) lands on a seat cell, else None."""
    for row_idx, row_label in enumerate(ROW_LABELS):
        y = header_y + 2 + row_idx * 2
        if my != y:
            continue
        x = start_x + 3
        for col in range(COLS):
            if col == aisle_col:
                x += gap
            if x <= mx < x + seat_width:
                return f"{row_label}{col + 1}"
            x += seat_width + gap
    return None


def book_seats(num_seats: int) -> list[str]:
    def _run(stdscr):
        global notify_text
        curses.curs_set(0)
        curses.mousemask(curses.ALL_MOUSE_EVENTS | curses.REPORT_MOUSE_POSITION)
        selected = set()

        layout_params = draw_layout(stdscr, selected, num_seats)

        while True:
            key = stdscr.getch()

            if key == ord('q') or key == ord('Q'):
                return []

            if key == ord('\n') or key == curses.KEY_ENTER:
                if len(selected) == num_seats:
                    return sorted(selected)

            if key == curses.KEY_MOUSE:
                try:
                    _, mx, my, _, bstate = curses.getmouse()
                except curses.error:
                    continue

                if bstate & curses.BUTTON1_CLICKED or bstate & curses.BUTTON1_PRESSED:
                    start_x, header_y, aisle_col, seat_width, gap = layout_params
                    seat_id = hit_test(my, mx, start_x, header_y,
                                       aisle_col, seat_width, gap)
                    if seat_id and seat_id not in BOOKED_SEATS:
                        if seat_id in selected:
                            if notify_text: notify_text = ""
                            selected.discard(seat_id)
                        elif len(selected) < num_seats:
                            selected.add(seat_id)
                        else:
                            notify_text = "All seats selected!"

            if key == curses.KEY_RESIZE:
                pass

            layout_params = draw_layout(stdscr, selected, num_seats)

    return curses.wrapper(_run)


def main():
    while True:
        try:
            n = int(input("How many seats would you like to book? "))
            if 1 <= n <= ROWS * COLS - len(BOOKED_SEATS):
                break
            print(f"Please enter a number between 1 and {ROWS * COLS - len(BOOKED_SEATS)}.")
        except ValueError:
            print("Invalid input. Please enter a number.")

    seats = book_seats(n)
    if seats:
        print(f"\nBooking confirmed! Seats: {seats}")
    else:
        print("\nBooking cancelled.")
    return seats


if __name__ == "__main__":
    main()
