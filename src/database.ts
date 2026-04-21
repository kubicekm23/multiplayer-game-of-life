
export class Database {
    /**
     * Method for registering new user
     * @param name Name of the new user, needs to be unique
     * @param password Password of the new user
     * @returns True if registered succesfully
     */
    public static registerUser(name: string, password: string): boolean {
        return true;
    }

    /**
     * Method for looging in as user
     * @param name Name of the user
     * @param password Password of the user
     * @returns True if logged in succesfully
     */
    public static logIn(name: string, password: string): boolean {
        return true;
    }
}